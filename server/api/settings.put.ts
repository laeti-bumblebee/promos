import { userSettings } from "../db/schema";

export default defineEventHandler(async (event) => {
  const sub = currentSub(event);
  const settings = cleanSettings(await readBody(event));
  await useDb()
    .insert(userSettings)
    .values({ sub, ...settings })
    .onConflictDoUpdate({ target: userSettings.sub, set: { ...settings, updatedAt: new Date() } });
  return settings;
});
