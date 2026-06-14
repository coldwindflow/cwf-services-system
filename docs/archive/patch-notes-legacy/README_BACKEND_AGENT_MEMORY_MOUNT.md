# CWF AI Office v21 backend mount note

This ZIP includes a production-safe backend route module:

server/routes/adminAiOfficeAgentMemory.js

It provides:
- GET  /admin/ai-office/agent-chat-history?agent_key=admin
- POST /admin/ai-office/agent-chat-history

To activate it, mount this route module in the same server/bootstrap place where other routes are mounted, using the existing `pool` and `requireAdminSession`:

```js
const createAdminAiOfficeAgentMemoryRoutes = require("./server/routes/adminAiOfficeAgentMemory");
app.use(createAdminAiOfficeAgentMemoryRoutes({ pool, requireAdminSession }));
```

If the app uses a central server file with different relative path, adjust the require path only.

The frontend v21 already works without this endpoint by falling back to localStorage + existing:
POST /admin/ai-office/reply-learning/event

But mounting the route gives true cross-device / database-backed Agent chat history.
