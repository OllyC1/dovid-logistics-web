export type NotificationMessage={to:string;subject:string;body:string;deduplicationKey:string};
export interface NotificationProvider{name:string;send(message:NotificationMessage):Promise<{providerId:string}>}
export class DisabledNotificationProvider implements NotificationProvider{name="disabled";async send():Promise<{providerId:string}>{throw new Error("Notification provider is not configured")}}
export function getEmailProvider():NotificationProvider{return new DisabledNotificationProvider()}
