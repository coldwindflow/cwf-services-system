# Server Routes

Future home for Express route modules extracted from `index.js`.

Do not import these folders into production until an extraction phase explicitly moves a route and deletes the old duplicate handler from `index.js` after checks pass.

Preferred pattern:

```js
module.exports = function createRoutes(deps) {
  const router = deps.express.Router();
  return router;
};
```

Keep route paths, middleware order, request payloads, response shapes, and SQL behavior unchanged during extraction.

