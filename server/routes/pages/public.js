module.exports = function createPublicPageRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const sendHtml = deps.sendHtml;

  router.get("/register", (req, res) => res.sendFile(sendHtml("register.html")));
  router.get("/home", (req, res) => res.sendFile(sendHtml("index.html")));
  router.get("/register.html", (req, res) => res.sendFile(sendHtml("register.html")));
  router.get("/index.html", (req, res) => res.sendFile(sendHtml("index.html")));

  return router;
};
