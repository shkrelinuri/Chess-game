import { createServer } from "node:http";
import { handleHttpRequest } from "./http-api";

const port = Number(process.env.API_PORT ?? 3002);
const server = createServer((request, response) => {
  void handleHttpRequest(request, response);
});

server.listen(port, () => {
  console.log(`Chess API listening on http://localhost:${port}`);
});