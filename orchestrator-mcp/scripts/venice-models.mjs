import { listVeniceModels } from "../venice-api.js";

const models = await listVeniceModels();

for (const model of models) {
  console.log(model.id);
}

