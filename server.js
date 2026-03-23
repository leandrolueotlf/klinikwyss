const path = require("path");
const express = require("express");

const app = express();
const port = Number(process.env.PORT) || 3000;

app.disable("x-powered-by");

app.use(
  express.static(path.join(__dirname, "public"), {
    index: "index.html",
    extensions: ["html"],
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "klinikwyss" });
});

app.use((_req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

app.listen(port, () => {
  console.log(`Klinik Wyss listening on port ${port}`);
});
