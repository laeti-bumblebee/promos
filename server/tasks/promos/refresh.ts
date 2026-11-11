import { refresh } from "../../services/refresh";

export default defineTask({
  meta: { name: "promos:refresh", description: "Fetch catalogues and read their pages" },
  async run() {
    await refresh(useDb(), runtimeRefreshOptions());
    return { result: "ok" };
  },
});
