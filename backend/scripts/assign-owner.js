import { config } from "../src/config.js";
import { createStore } from "../src/stores/index.js";

const [collection, id, ownerId, confirmation] = process.argv.slice(2);
if (!["tasks", "teams", "applications"].includes(collection) || !id || !ownerId || confirmation !== "--server-stopped") {
  console.error("Остановите backend и сделайте резервную копию базы. Команда: node scripts/assign-owner.js tasks|teams|applications ID USER_ID --server-stopped");
  process.exitCode = 1;
} else {
  try {
    const store = await createStore(config);
    try { await store.assignLegacyOwner(collection, id, ownerId); } finally { await store.close(); }
    console.log("Владелец назначен. Изменение записано в журнал миграций.");
  } catch {
    console.error("Назначение не выполнено. Проверьте идентификаторы, роль и отсутствие владельца.");
    process.exitCode = 1;
  }
}
