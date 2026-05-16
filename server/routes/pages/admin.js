module.exports = function createAdminPageRoutes(deps = {}) {
  const express = require("express");
  const router = express.Router();
  const sendHtml = deps.sendHtml;

  router.get("/admin-legacy", (req, res) => res.redirect(302, "/admin-review-v2.html"));
  router.get("/admin-legacy.html", (req, res) => res.redirect(302, "/admin-review-v2.html"));
  router.get("/admin", (req, res) => res.redirect(302, "/admin-review-v2.html"));
  router.get("/admin.html", (req, res) => res.redirect(302, "/admin-review-v2.html"));
  router.get("/admin-tech", (req, res) => res.redirect(302, "/admin-review-v2.html"));
  router.get("/admin-tech.html", (req, res) => res.redirect(302, "/admin-review-v2.html"));
  router.get("/add-job", (req, res) => res.redirect(302, "/admin-add-v2.html"));
  router.get("/add-job.html", (req, res) => res.redirect(302, "/admin-add-v2.html"));
  router.get("/admin-add", (req, res) => res.sendFile(sendHtml("admin-add-v2.html")));
  router.get("/admin-review", (req, res) => res.sendFile(sendHtml("admin-review-v2.html")));
  router.get("/admin-queue", (req, res) => res.sendFile(sendHtml("admin-queue-v2.html")));
  router.get("/admin-history", (req, res) => res.sendFile(sendHtml("admin-history-v2.html")));
  router.get("/admin-add-v2.html", (req, res) => res.sendFile(sendHtml("admin-add-v2.html")));
  router.get("/admin-review-v2.html", (req, res) => res.sendFile(sendHtml("admin-review-v2.html")));
  router.get("/admin-queue-v2.html", (req, res) => res.sendFile(sendHtml("admin-queue-v2.html")));
  router.get("/admin-history-v2.html", (req, res) => res.sendFile(sendHtml("admin-history-v2.html")));

  return router;
};
