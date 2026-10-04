declare module '@huddle01/react-native-call-detection' {
    export type CallState = "IDLE" | "INCOMING" | "OFFHOOK" | "DISCONNECTED" | "MISSED" | "DIALING";

    export default class CallDetectorManager {
        constructor(
            callback: (event: string, phoneNumber: string) => void,
            readPhoneNumberAndroid?: boolean,
            permissionDeniedCallback?: (error: string) => void,
            permissionMessage?: { title: string; message: string }
        );
        dispose(): void;
    }
}