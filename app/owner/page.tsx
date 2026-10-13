import Conversation from '../conversation';

// Covered by the existing server-side internal authentication gate. This is a
// protected presentation route, not a new role or a public customer release.
export default function OwnerConversation() { return <Conversation owner />; }
