module.exports = function createPageRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const createAdminPageRoutes = require("./admin");
  const createTechnicianPageRoutes = require("./technician");
  const createPublicPageRoutes = require("./public");
  const sendHtml = deps.sendHtml;

  router.get("/login", (req, res) => res.sendFile(sendHtml("login.html")));
  router.get("/login.html", (req, res) => res.sendFile(sendHtml("login.html")));

  router.use(createAdminPageRoutes({ sendHtml }));
  router.use(createTechnicianPageRoutes({ sendHtml }));
  router.use(createPublicPageRoutes({ sendHtml }));

  return router;
};
