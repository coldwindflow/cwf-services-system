module.exports = function createPageRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const sendHtml = deps.sendHtml;

  router.get("/login", (req, res) => res.sendFile(sendHtml("login.html")));
  router.get("/login.html", (req, res) => res.sendFile(sendHtml("login.html")));
  router.get("/admin-legacy", (req, res) => res.redirect(302, "/admin-review-v2.html"));
  router.get("/admin-legacy.html", (req, res) => res.redirect(302, "/admin-review-v2.html"));

  return router;
};
