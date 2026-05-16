module.exports = function createTechnicianPageRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const sendHtml = deps.sendHtml;

  router.get("/edit-profile", (req, res) => res.sendFile(sendHtml("edit-profile.html")));
  router.get("/tech", (req, res) => res.sendFile(sendHtml("tech.html")));
  router.get("/edit-profile.html", (req, res) => res.sendFile(sendHtml("edit-profile.html")));
  router.get("/tech.html", (req, res) => res.sendFile(sendHtml("tech.html")));

  return router;
};
