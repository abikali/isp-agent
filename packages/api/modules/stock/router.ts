import { addStockQuantity } from "./procedures/add-quantity";
import { createStockItem } from "./procedures/create-item";
import { deleteStockItem } from "./procedures/delete-item";
import { deliverStockToWorker } from "./procedures/deliver-to-worker";
import { listStockItems } from "./procedures/list-items";
import { listStockLogs } from "./procedures/list-logs";
import { returnStockFromWorker } from "./procedures/return-from-worker";
import { getStockStats } from "./procedures/stats";
import { updateStockItem } from "./procedures/update-item";
import {
	getMyStock,
	getWorkerStockByEmployee,
} from "./procedures/worker-stock";

export const stockRouter = {
	listItems: listStockItems,
	createItem: createStockItem,
	updateItem: updateStockItem,
	deleteItem: deleteStockItem,
	addQuantity: addStockQuantity,
	deliverToWorker: deliverStockToWorker,
	returnFromWorker: returnStockFromWorker,
	listLogs: listStockLogs,
	workerStockByEmployee: getWorkerStockByEmployee,
	myStock: getMyStock,
	stats: getStockStats,
};
