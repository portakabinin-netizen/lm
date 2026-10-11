import { getSocket } from '@/hooks/Socket';
import { appService } from '@/UtilServices/appHelper';
import { Ionicons } from '@expo/vector-icons';
import { jwtDecode } from 'jwt-decode';
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CreateGroupSheet } from '../components/staff-dashboard/modals/CreateGroupSheet';

interface Props {
  visible: boolean;
  onClose: () => void;
  token: string;
  userId: string;
  name: string;
  onAttachmentPress?: () => void;
  onUnseenCountChange?: (count: number | any) => void;
  onBroadcastUnseenChange?: (count: number | any) => void;
  onGroupUnseenChange?: (count: number | any) => void;
}

export const ChatRoomModal = forwardRef(
  (
    {
      visible,
      onClose,
      token,
      userId,
      name,
      onAttachmentPress,
      onUnseenCountChange,
      onBroadcastUnseenChange,
    }: Props,
    ref
  ) => {
    const [chatMessages, setChatMessages] = useState<any[]>([]);
    const [unseenCount, setUnseenCount] = useState(0);
    const [broadcastUnseenCount, setBroadcastUnseenCount] = useState(0);
    const [chatView, setChatView] = useState<'list' | 'chat'>('list');

    const dbName = useMemo(() => {
      try {
        const decoded = jwtDecode<{ dbName?: string }>(token);
        return decoded.dbName || '';
      } catch (e) {
        return '';
      }
    }, [token]);

    const fetchMessages = async () => {
      if (!token || !dbName) return;
      try {
        const res = await appService.httpClient.get('service/chat/messages', {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-tenant-id': dbName,
          },
        });
        if (res.data?.success) {
          setChatMessages(res.data.data);
          const unseen = res.data.data.filter(
            (m: any) => m.isOneToOne && m.status === 'unseen' && m.receiverId === userId
          ).length;
          setUnseenCount(unseen);
          const broadcastUnseen = res.data.data.filter(
            (m: any) => !m.isOneToOne && m.status === 'unseen' && m.senderId !== userId
          ).length;
          setBroadcastUnseenCount(broadcastUnseen);
        }
      } catch (err) {
        console.error('Failed to fetch messages', err);
      }
    };

    useEffect(() => {
      fetchMessages();

      const interval = setInterval(() => {
        const socket = getSocket();
        if (!socket.connected) {
          // console.log("📡 Socket disconnected, polling for messages...");
          fetchMessages();
        }
      }, 15000); // Poll every 15 seconds

      return () => clearInterval(interval);
    }, [token, userId]);

    useEffect(() => {
      const socket = getSocket();
      let currentDbName = '';

      try {
        const decoded = jwtDecode<{ dbName?: string }>(token);
        currentDbName = decoded.dbName || '';
        if (currentDbName) {
          socket.emit('joinRoom', currentDbName);
        }
      } catch (e) {
        console.error('Failed to get dbName from token', e);
      }

      const handleConnect = () => {
        //console.log("🔄 handleConnect Triggered! dbName:", currentDbName, "socket.id:", socket.id);
        if (currentDbName) {
          socket.emit('joinRoom', currentDbName);
        }
      };

      const handleConnectError = (err: any) => {
        console.error('❌ Socket connection error:', err.message);
      };

      if (socket.connected) {
        handleConnect();
      }

      const handleNewMessage = (msg: any) => {
        setChatMessages((prev) => {
          if (prev.some((m) => m._id === msg._id || (m.id && m.id === msg.id))) return prev;

          // Update unseen count if message is directed to me and is one-to-one
          if (msg.isOneToOne && msg.receiverId === userId) {
            setUnseenCount((count) => count + 1);
            // Emit delivered event back to sender
            socket.emit('messageDelivered', { messageId: msg._id, senderId: msg.senderId });
          } else if (!msg.isOneToOne && msg.senderId !== userId) {
            setBroadcastUnseenCount((count) => count + 1);
          }

          return [...prev, msg];
        });
      };

      const handleMessagesSeen = (data: any) => {
        setChatMessages((prev) =>
          prev.map((m) => (data.messageIds.includes(m._id) ? { ...m, status: 'seen' } : m))
        );
      };

      const handleMessageDelivered = (data: any) => {
        setChatMessages((prev) =>
          prev.map((m) => (m._id === data.messageId ? { ...m, status: 'delivered' } : m))
        );
      };

      socket.on('connect', handleConnect);
      socket.on('connect_error', handleConnectError);
      socket.on('newMessage', handleNewMessage);
      socket.on('messagesSeen', handleMessagesSeen);
      socket.on('messageDelivered', handleMessageDelivered);

      return () => {
        socket.off('connect', handleConnect);
        socket.off('connect_error', handleConnectError);
        socket.off('newMessage', handleNewMessage);
        socket.off('messagesSeen', handleMessagesSeen);
        socket.off('messageDelivered', handleMessageDelivered);
      };
    }, [token, userId]);

    useEffect(() => {
      if (onUnseenCountChange) {
        onUnseenCountChange(unseenCount);
      }
    }, [unseenCount, onUnseenCountChange]);

    useEffect(() => {
      if (onBroadcastUnseenChange) {
        onBroadcastUnseenChange(broadcastUnseenCount);
      }
    }, [broadcastUnseenCount, onBroadcastUnseenChange]);
    const [selectedChatUser, setSelectedChatUser] = useState<any>(null);
    const [userList, setUserList] = useState<any[]>([]);
    const [showUserList, setShowUserList] = useState(false);
    const [userSearchInput, setUserSearchInput] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [isDark] = useState(false); // Kept same as inline
    const [showCreateGroup, setShowCreateGroup] = useState(false);

    useImperativeHandle(ref, () => ({
      setNewMessage: (msg: string) => setNewMessage(msg),
    }));

    const userRole = useMemo(() => {
      try {
        const decoded: any = jwtDecode(token);
        return decoded.userRole;
      } catch (e) {
        return 'User'; // Fallback
      }
    }, [token]);

    useEffect(() => {
      if (visible) {
        // Fetch users when modal becomes visible
        const fetchUsers = () => {
          Promise.all([
            appService.httpClient.get('service/hr/employees', {
              headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': dbName },
            }),
            appService.httpClient.get('service/staff', {
              headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': dbName },
            }),
          ])
            .then(([res1, res2]) => {
              const emps = res1.data?.success ? res1.data.data : [];
              const staff = res2.data?.success ? res2.data.data : [];
              const merged = [
                ...staff.map((u: any) => ({
                  _id: u._id,
                  name: u.userDisplayName || u.name,
                  role: u.userRole || 'User',
                  image: u.photo_url || u.userProfileImage || u.photo || u.employeeImage,
                  phone: u.userPhone || u.phone,
                })),
                ...emps.map((u: any) => ({
                  _id: u.user_id || u._id,
                  name: u.name,
                  role: u.role || 'Staff',
                  image: u.photo_url || u.photo || u.userProfileImage || u.employeeImage,
                  phone: u.phone,
                })),
              ];
              const unique = merged.filter(
                (v, i, a) =>
                  a.findIndex(
                    (t) =>
                      t._id === v._id ||
                      (t.phone && v.phone && t.phone === v.phone) ||
                      t.name?.toLowerCase().trim() === v.name?.toLowerCase().trim()
                  ) === i
              );
              setUserList(unique);
            })
            .catch((err) => console.error('Failed to fetch user list', err));
        };
        fetchUsers();
      }
    }, [visible, token]);

    const getLastMessage = (user: any) => {
      const userMessages = chatMessages.filter(
        (m) =>
          (m.isOneToOne && m.senderId === user._id && m.receiverId === userId) ||
          (m.isOneToOne && m.senderId === userId && m.receiverId === user._id)
      );
      if (userMessages.length === 0) return null;
      return userMessages[userMessages.length - 1];
    };

    // Mark messages as seen when chat is open
    useEffect(() => {
      if (visible && chatView === 'chat' && chatMessages.length > 0) {
        const messagesToMarkSeen = chatMessages.filter((m) => {
          const isTarget = selectedChatUser
            ? m.isOneToOne && m.senderId === selectedChatUser._id && m.receiverId === userId
            : !m.isOneToOne && m.senderId !== userId;
          return isTarget && m.status === 'unseen';
        });

        if (messagesToMarkSeen.length > 0) {
          const ids = messagesToMarkSeen.map((m) => m._id);
          appService.httpClient
            .put(
              'service/chat/seen',
              { messageIds: ids },
              {
                headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': dbName },
              }
            )
            .then((res) => {
              if (res.data?.success) {
                setChatMessages((prev) =>
                  prev.map((m) => (ids.includes(m._id) ? { ...m, status: 'seen' } : m))
                );
                const oneToOneSeenCount = messagesToMarkSeen.filter((m) => m.isOneToOne).length;
                const broadcastSeenCount = messagesToMarkSeen.filter((m) => !m.isOneToOne).length;
                setUnseenCount((prev) => Math.max(0, prev - oneToOneSeenCount));
                setBroadcastUnseenCount((prev) => Math.max(0, prev - broadcastSeenCount));
              }
            })
            .catch((err) => console.error('Failed to mark messages as seen', err));
        }
      }
    }, [visible, chatView, chatMessages, selectedChatUser, userId, token]);

    const handleSend = async () => {
      if (!newMessage.trim()) return;

      // Prevent workers from sending broadcast messages
      if (!selectedChatUser && !(userRole === 'CorpAdmin' || userRole === 'userAdmin')) {
        Alert.alert('Permission Denied', 'You are not allowed to send broadcast messages.');
        return;
      }

      const payload = {
        senderName: name,
        senderId: userId,
        text: newMessage,
        type: 'text',
        isOneToOne: !!selectedChatUser,
        receiverId: selectedChatUser?._id,
      };

      try {
        const res = await appService.httpClient.post('service/chat/send', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.data?.success) {
          setChatMessages((prev) => {
            if (prev.some((m) => m._id === res.data.data._id)) return prev;
            return [...prev, res.data.data];
          });
          setNewMessage('');
        }
      } catch (err) {
        console.error('Failed to send message', err);
      }
    };

    const groupedMessages = useMemo(() => {
      const filtered = chatMessages.filter((m) => {
        if (selectedChatUser) {
          return (
            m.isOneToOne &&
            ((m.senderId === userId && m.receiverId === selectedChatUser._id) ||
              (m.senderId === selectedChatUser._id && m.receiverId === userId))
          );
        } else {
          return !m.isOneToOne;
        }
      });

      const grouped: any[] = [];
      let lastDateStr: string | null = null;

      filtered.forEach((m) => {
        const d = new Date(m.createdAt || Date.now());
        const dateStr = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
        
        let displayDate = dateStr;
        const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterday = yesterdayDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

        if (dateStr === today) {
          displayDate = 'Today';
        } else if (dateStr === yesterday) {
          displayDate = 'Yesterday';
        }

        if (dateStr !== lastDateStr) {
          grouped.push({ isDateHeader: true, dateStr: displayDate, _id: `header-${dateStr}`, id: `header-${dateStr}` });
          lastDateStr = dateStr;
        }
        grouped.push(m);
      });
      return grouped;
    }, [chatMessages, selectedChatUser, userId]);

    return (
      <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <SafeAreaView
            style={{ flex: 1, backgroundColor: isDark ? '#0f172a' : '#f8fafc' }}
            edges={['bottom', 'top']}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 15,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: isDark ? '#334155' : '#e2e8f0',
                backgroundColor: '#0F172A',
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  if (chatView === 'chat') {
                    setChatView('list');
                  } else {
                    onClose();
                    setShowUserList(false);
                  }
                }}
              >
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
              <View
                style={{
                  marginLeft: 15,
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                {chatView !== 'list' &&
                  selectedChatUser &&
                  (selectedChatUser.image ? (
                    <Image
                      source={{
                        uri: selectedChatUser.image.startsWith('http')
                          ? selectedChatUser.image
                          : `${(appService.httpClient.defaults.baseURL || '').replace(/\/api\/?$/, '')}/${selectedChatUser.image.startsWith('/') ? selectedChatUser.image.slice(1) : selectedChatUser.image}`,
                      }}
                      style={{ width: 30, height: 30, borderRadius: 15 }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: '#cbd5e1',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a' }}>
                        {selectedChatUser.name?.charAt(0)}
                      </Text>
                    </View>
                  ))}
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#fff' }}>
                  {chatView === 'list'
                    ? 'Chat Room'
                    : selectedChatUser
                      ? selectedChatUser.name
                      : 'Workforce Chat'}
                </Text>
              </View>
              <TouchableOpacity
                style={{ padding: 5 }}
                onPress={() => setShowUserList(!showUserList)}
              >
                <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* 3-Dots Menu */}
            {showUserList && (
              <View
                style={{
                  position: 'absolute',
                  top: 50,
                  right: 10,
                  backgroundColor: isDark ? '#1e293b' : '#fff',
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: isDark ? '#334155' : '#e2e8f0',
                  maxHeight: 300,
                  width: 200,
                  zIndex: 1000,
                  elevation: 5,
                  shadowColor: '#000',
                  shadowOpacity: 0.2,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 2 },
                }}
              >
                <ScrollView>
                  <TouchableOpacity
                    style={{
                      padding: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: isDark ? '#334155' : '#f1f5f9',
                    }}
                    onPress={() => {
                      setNewMessage('Request for Advance: ₹');
                      setShowUserList(false);
                      if (chatView === 'list') setChatView('chat');
                    }}
                  >
                    <Text style={{ fontSize: 14, color: isDark ? '#fff' : '#0f172a' }}>
                      💰 Advance
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      padding: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: isDark ? '#334155' : '#f1f5f9',
                    }}
                    onPress={() => {
                      setNewMessage('Apply for Leave: [Days] from [Date]');
                      setShowUserList(false);
                      if (chatView === 'list') setChatView('chat');
                    }}
                  >
                    <Text style={{ fontSize: 14, color: isDark ? '#fff' : '#0f172a' }}>
                      📅 Leave
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      padding: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: isDark ? '#334155' : '#f1f5f9',
                    }}
                    onPress={() => {
                      setNewMessage('Request for Uniform/Equipment: ');
                      setShowUserList(false);
                      if (chatView === 'list') setChatView('chat');
                    }}
                  >
                    <Text style={{ fontSize: 14, color: isDark ? '#fff' : '#0f172a' }}>
                      👕 Uniform
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            )}

            {chatView === 'list' && (
              <>
                {/* Search Bar & Create Group */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 10,
                    backgroundColor: isDark ? '#1e293b' : '#fff',
                    borderBottomWidth: 1,
                    borderBottomColor: isDark ? '#334155' : '#e2e8f0',
                    gap: 10,
                  }}
                >
                  <TextInput
                    placeholder="Search users..."
                    placeholderTextColor="#94a3b8"
                    value={userSearchInput}
                    onChangeText={setUserSearchInput}
                    style={{
                      borderWidth: 1,
                      borderColor: isDark ? '#334155' : '#cbd5e1',
                      borderRadius: 10,
                      padding: 8,
                      color: isDark ? '#fff' : '#000',
                      backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                      flex: 1,
                    }}
                  />
                  {(userRole === 'CorpAdmin' || userRole === 'userAdmin' || userRole === 'Supervisor' || userRole === 'CorpAdminFull') && (
                    <TouchableOpacity
                      onPress={() => setShowCreateGroup(true)}
                      style={{
                        backgroundColor: '#e0f2fe',
                        padding: 8,
                        borderRadius: 10,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Ionicons name="people" size={20} color="#0369a1" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* User List */}
                <FlatList
                  data={[
                    {
                      _id: 'broadcast',
                      name: '📢 Broadcast Room',
                      role: 'Public',
                      isBroadcast: true,
                    },
                    ...userList
                      .filter(
                        (u) =>
                          u._id !== userId &&
                          u.name.toLowerCase().includes(userSearchInput.toLowerCase())
                      )
                      .sort((a, b) => {
                        const unseenA = chatMessages.filter(
                          (m) => m.senderId === a._id && m.status === 'unseen' && m.isOneToOne
                        ).length;
                        const unseenB = chatMessages.filter(
                          (m) => m.senderId === b._id && m.status === 'unseen' && m.isOneToOne
                        ).length;

                        if (unseenA > 0 && unseenB === 0) return -1;
                        if (unseenA === 0 && unseenB > 0) return 1;
                        return a.name.localeCompare(b.name);
                      }),
                  ]}
                  keyExtractor={(item) => item._id}
                  contentContainerStyle={{ padding: 10 }}
                  renderItem={({ item }) => {
                    if (item.isBroadcast) {
                      const unseen = chatMessages.filter(
                        (m) => !m.isOneToOne && m.status === 'unseen' && m.senderId !== userId
                      ).length;
                      return (
                        <TouchableOpacity
                          style={{
                            padding: 12,
                            borderBottomWidth: 1,
                            borderBottomColor: isDark ? '#334155' : '#f1f5f9',
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                          onPress={() => {
                            setSelectedChatUser(null);
                            setChatView('chat');
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View
                              style={{
                                width: 35,
                                height: 35,
                                borderRadius: 17.5,
                                backgroundColor: '#e0f2fe',
                                justifyContent: 'center',
                                alignItems: 'center',
                              }}
                            >
                              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0369a1' }}>
                                📢
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={{
                                  fontSize: 15,
                                  color: isDark ? '#fff' : '#0f172a',
                                  fontWeight: '600',
                                }}
                              >
                                Broadcast Room
                              </Text>
                              <Text style={{ fontSize: 12, color: '#64748b' }}>
                                Public Messages
                              </Text>
                            </View>
                          </View>
                          {unseen > 0 && (
                            <View
                              style={{
                                backgroundColor: '#ef4444',
                                borderRadius: 10,
                                minWidth: 20,
                                height: 20,
                                justifyContent: 'center',
                                alignItems: 'center',
                                paddingHorizontal: 5,
                              }}
                            >
                              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                                {unseen}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    }

                    const unseen = chatMessages.filter(
                      (m) => m.senderId === item._id && m.status === 'unseen' && m.isOneToOne
                    ).length;
                    return (
                      <TouchableOpacity
                        style={{
                          padding: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: isDark ? '#334155' : '#f1f5f9',
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                        onPress={() => {
                          setSelectedChatUser(item);
                          setChatView('chat');
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          {item.image ? (
                            <Image
                              source={{
                                uri: item.image.startsWith('http')
                                  ? item.image
                                  : `${(appService.httpClient.defaults.baseURL || '').replace(/\/api\/?$/, '')}/${item.image.startsWith('/') ? item.image.slice(1) : item.image}`,
                              }}
                              style={{ width: 35, height: 35, borderRadius: 17.5 }}
                            />
                          ) : (
                            <View
                              style={{
                                width: 35,
                                height: 35,
                                borderRadius: 17.5,
                                backgroundColor: '#cbd5e1',
                                justifyContent: 'center',
                                alignItems: 'center',
                              }}
                            >
                              <Text style={{ fontSize: 14, fontWeight: '700' }}>
                                {item.name?.charAt(0)}
                              </Text>
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontSize: 15,
                                color: isDark ? '#fff' : '#0f172a',
                                fontWeight: '600',
                              }}
                            >
                              {item.name}
                            </Text>
                            {(() => {
                              const lastMsg = getLastMessage(item);
                              const isUnseen =
                                lastMsg &&
                                lastMsg.status === 'unseen' &&
                                lastMsg.senderId !== userId;
                              return (
                                <Text
                                  style={{
                                    fontSize: 12,
                                    color: isUnseen ? (isDark ? '#fff' : '#0f172a') : '#64748b',
                                    fontWeight: isUnseen ? '700' : '400',
                                  }}
                                  numberOfLines={1}
                                >
                                  {lastMsg ? lastMsg.text : item.role}
                                </Text>
                              );
                            })()}
                          </View>
                        </View>
                        {unseen > 0 && (
                          <View
                            style={{
                              backgroundColor: '#ef4444',
                              borderRadius: 10,
                              minWidth: 20,
                              height: 20,
                              justifyContent: 'center',
                              alignItems: 'center',
                              paddingHorizontal: 5,
                            }}
                          >
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                              {unseen}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={
                    <View style={{ alignItems: 'center', marginTop: 40 }}>
                      <Text style={{ color: '#64748b' }}>No users found</Text>
                    </View>
                  }
                />
              </>
            )}

            {chatView === 'chat' && (
              <>
                {/* Message List */}
                <FlatList
                  data={groupedMessages}
                  keyExtractor={(item) => item._id || item.id}
                  contentContainerStyle={{ padding: 15 }}
                  renderItem={({ item }) => {
                    if (item.isDateHeader) {
                      return (
                        <View style={{ alignItems: 'center', marginVertical: 10 }}>
                          <View style={{ backgroundColor: isDark ? '#334155' : '#e2e8f0', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
                            <Text style={{ fontSize: 12, color: isDark ? '#cbd5e1' : '#64748b', fontWeight: 'bold' }}>{item.dateStr}</Text>
                          </View>
                        </View>
                      );
                    }
                    const isMe = item.senderId === userId || item.sender === name;
                    return (
                      <View
                        style={{
                          alignSelf: isMe ? 'flex-end' : 'flex-start',
                          backgroundColor: isMe ? '#d9fdd3' : '#fff',
                          padding: 10,
                          borderRadius: 10,
                          marginBottom: 10,
                          maxWidth: '80%',
                          borderWidth: 1,
                          borderColor: isMe ? '#bbf7d0' : '#e2e8f0',
                        }}
                      >
                        {!isMe && (
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '700',
                              color: '#64748b',
                              marginBottom: 2,
                            }}
                          >
                            {item.senderName || item.sender}
                          </Text>
                        )}
                        <Text
                          style={{
                            fontSize: 14,
                            color: '#0f172a',
                            fontWeight:
                              item.status === 'unseen' && item.senderId !== userId ? '700' : '400',
                          }}
                        >
                          {item.text}
                        </Text>
                        {item.text?.startsWith('Emergency Duty Off Request:') &&
                          (userRole === 'CorpAdmin' || userRole === 'userAdmin') && (
                            <TouchableOpacity
                              onPress={async () => {
                                try {
                                  const res = await (appService as any).toggleDuty(
                                    {
                                      employeeId: item.senderId,
                                      type: 'OFF',
                                      forcedOff: true,
                                      forcedOffReason: item.text,
                                    },
                                    token
                                  );
                                  if (res?.success) {
                                    Alert.alert('Success', 'Duty ended for user.');
                                  }
                                } catch (err) {
                                  console.error('Failed to end duty from chat', err);
                                  Alert.alert('Error', 'Failed to end duty.');
                                }
                              }}
                              style={{
                                marginTop: 8,
                                backgroundColor: '#ef4444',
                                paddingVertical: 6,
                                paddingHorizontal: 12,
                                borderRadius: 6,
                                alignItems: 'center',
                              }}
                            >
                              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                                End Duty
                              </Text>
                            </TouchableOpacity>
                          )}
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            alignSelf: 'flex-end',
                            marginTop: 2,
                          }}
                        >
                          <Text style={{ fontSize: 9, color: '#64748b' }}>
                            {item.createdAt
                              ? new Date(item.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : item.time}
                          </Text>
                          {isMe && (
                            <Ionicons
                              name={
                                item.status === 'seen' || item.status === 'delivered'
                                  ? 'checkmark-done'
                                  : 'checkmark'
                              }
                              size={12}
                              color={item.status === 'seen' ? '#34b7f1' : '#8696a0'}
                              style={{ marginLeft: 2 }}
                            />
                          )}
                        </View>
                      </View>
                    );
                  }}
                  ListEmptyComponent={
                    <View style={{ alignItems: 'center', marginTop: 40 }}>
                      <Ionicons name="chatbubbles-outline" size={48} color="#cbd5e1" />
                      <Text style={{ color: '#64748b', marginTop: 10 }}>
                        No messages yet. Start the conversation!
                      </Text>
                    </View>
                  }
                />

                {/* Input Bar */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 10,
                    backgroundColor: isDark ? '#1e293b' : '#fff',
                    borderTopWidth: 1,
                    borderTopColor: isDark ? '#334155' : '#e2e8f0',
                  }}
                >
                  {onAttachmentPress && (
                    <TouchableOpacity style={{ padding: 5 }} onPress={onAttachmentPress}>
                      <Ionicons name="add" size={24} color="#0284c7" />
                    </TouchableOpacity>
                  )}
                  <TextInput
                    placeholder={
                      selectedChatUser ? `Message ${selectedChatUser.name}...` : 'Type a message...'
                    }
                    placeholderTextColor="#94a3b8"
                    value={newMessage}
                    onChangeText={setNewMessage}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: isDark ? '#334155' : '#cbd5e1',
                      borderRadius: 20,
                      paddingHorizontal: 15,
                      paddingVertical: 8,
                      color: isDark ? '#fff' : '#000',
                      backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                      marginHorizontal: 5,
                    }}
                  />
                  <TouchableOpacity
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: '#0284c7',
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                    onPress={handleSend}
                  >
                    <Ionicons name="send" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </SafeAreaView>
        </KeyboardAvoidingView>

        <CreateGroupSheet
          visible={showCreateGroup}
          onClose={() => setShowCreateGroup(false)}
          userList={userList}
          currentUserRole={userRole}
        />
      </Modal>
    );
  }
);

export default ChatRoomModal;
