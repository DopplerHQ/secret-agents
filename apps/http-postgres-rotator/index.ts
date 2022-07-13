import { processRequest } from "agent-core";
import express from "express";
import postgresHandler from "postgres-rotator";

const app = express();
app.use(express.text());
app.use(express.text({ limit: "50kb" }));

app.post("/", async (req, res) => {
  const response = await processRequest(req.body, postgresHandler, {
    overrideKeySet: process.env.OVERRIDE_KEY_SET_URL ? { type: "remote", url: process.env.OVERRIDE_KEY_SET_URL } : undefined,
  });
  res.send(response);
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const server = app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
server.setTimeout(30000);
