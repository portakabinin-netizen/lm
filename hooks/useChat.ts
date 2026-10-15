import { useState, useEffect } from 'react';
import { appService } from '@/UtilServices/appHelper';
import { getSocket } from '@/hooks/Socket';
import { jwtDecode } from 'jwt-decode';

export const useChat = (token: string, userId: string) => {
    const [chatMessages, setChatMessages] = useState<any[]>([]);
    const [unseenCount, setUnseenCount] = useState(0);
    const [latestBroadcast, setLatestBroadcast] = useState<string>('');

    const fetchMessages = async () => {
        if (!token) return;
        let dbName = '';
        try { 
            const decoded = jwtDecode<{ dbName?: string }>(token);
            dbName = decoded.dbName || ''; 
        } catch(e) {}
        
        if (!dbName) return;
        
        try {
            const res = await appService.httpClient.get('service/chat/messages', {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'x-tenant-id': dbName
                }
            });
            if (res.data?.success) {
                setChatMessages(res.data.data);
                
                // Extract latest broadcast message
                const broadcasts = res.data.data.filter((m: any) => !m.isOneToOne);
                if (broadcasts.length > 0) {
                    broadcasts.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                    setLatestBroadcast(broadcasts[0].text);
                }

                const unseen = res.data.data.filter((m: any) => m.isOneToOne && m.status === 'unseen' && m.senderId !== userId).length;
                setUnseenCount(unseen);
            }
        } catch (err) {
            console.error("Failed to fetch messages", err);
        }
    };

    useEffect(() => {
        fetchMessages();
    }, [token, userId]);

    useEffect(() => {
        if (!token) return;

        const socket = getSocket();

        try {
            const decoded = jwtDecode<{ dbName?: string }>(token);
            const dbName = decoded.dbName;
            if (dbName) {
                socket.emit('joinRoom', dbName);
            }
        } catch (e) {
            console.error("Failed to get dbName from token", e);
        }

        const handleNewMessage = (msg: any) => {
            setChatMessages((prev) => {
                if (prev.some(m => m._id === msg._id || (m.id && m.id === msg.id))) return prev;

                // Update unseen count if message is not from me and is one-to-one
                if (msg.isOneToOne && msg.senderId !== userId) {
                    setUnseenCount((count) => count + 1);
                    // Emit delivered event back to sender
                    socket.emit('messageDelivered', { messageId: msg._id, senderId: msg.senderId });
                    appService.playAlertTone();
                }

                // Update latest broadcast if it's a broadcast message
                if (!msg.isOneToOne) {
                    setLatestBroadcast(msg.text);
                    if (msg.senderId !== userId) {
                        appService.playAlertTone();
                    }
                }

                return [...prev, msg];
            });
        };

        const handleMessagesSeen = (data: any) => {
            setChatMessages((prev) =>
                prev.map(m => data.messageIds.includes(m._id) ? { ...m, status: 'seen' } : m)
            );
        };

        const handleMessageDelivered = (data: any) => {
            setChatMessages((prev) =>
                prev.map(m => m._id === data.messageId ? { ...m, status: 'delivered' } : m)
            );
        };

        socket.on('newMessage', handleNewMessage);
        socket.on('messagesSeen', handleMessagesSeen);
        socket.on('messageDelivered', handleMessageDelivered);

        return () => {
            socket.off('newMessage', handleNewMessage);
            socket.off('messagesSeen', handleMessagesSeen);
            socket.off('messageDelivered', handleMessageDelivered);
        };
    }, [token, userId]);

    return {
        chatMessages,
        setChatMessages,
        unseenCount,
        setUnseenCount,
        latestBroadcast,
        setLatestBroadcast,
        fetchMessages
    };
};
