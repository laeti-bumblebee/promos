export default defineEventHandler(async (event) => {
  const { storeIds, excludedCategories } = await loadSettings(currentSub(event));
  return { storeIds, excludedCategories };
});
