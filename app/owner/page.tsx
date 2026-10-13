import Conversation from '../conversation';
import { historyEnabled } from '../lib/estimate-access';

// Covered by the existing server-side internal authentication gate. This is a
// protected presentation route, not a new role or a public customer release.
export default function OwnerConversation() { return <Conversation owner archiveEnabled={historyEnabled()} />; }
