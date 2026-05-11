module.exports = function createPageRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const sendHtml = deps.sendHtml;

  router.get("/login", (req, res) => res.sendFile(sendHtml("login.html")));
  router.get("/login.html", (req, res) => res.sendFile(sendHtml("login.html")));

  return router;
};
