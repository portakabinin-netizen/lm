declare module "react-native-call-detection" {
  type CallEvent =
    | "Incoming"
    | "Offhook"
    | "Disconnected"
    | "Missed";

  export default class CallDetectorManager {
    constructor(
      callback: (event: CallEvent, phoneNumber?: string) => void,
      detectIncoming?: boolean,
      detectOutgoing?: boolean
    );

    dispose(): void;
  }
}
