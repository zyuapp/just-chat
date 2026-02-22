import { stdout as output } from "node:process";
import { createMemoryStore } from "../memory/store.js";

const memory = createMemoryStore();
memory.close();

output.write("Database schema ensured at data/app.db\n");
