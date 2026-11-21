import { getConfig } from "../lib/config.ts";
import { openDatabase } from "../lib/db/connection.ts";

const { databasePath } = getConfig();
const db = openDatabase(databasePath);
db.close();
console.log(`Database ready at ${databasePath}`);
