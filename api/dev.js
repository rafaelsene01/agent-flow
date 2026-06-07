import chalk from "chalk";
import { startServer } from "./server.js";

const port = Number(process.env.PORT) || 5522;

try {
  await startServer({ port, apiOnly: true });
  console.log(`  ${chalk.bold.cyan("API")} ${chalk.green("►")} http://localhost:${port}`);
} catch (err) {
  console.error(chalk.red("Erro: " + err.message));
  process.exit(1);
}
