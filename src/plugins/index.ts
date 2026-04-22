import { appLauncherPlugin } from "./appLauncher";
import { calculatorPlugin } from "./calculator";
import { dockerPlugin } from "./docker";
import { webSearchPlugin } from "./webSearch";
import { fileSearchPlugin } from "./fileSearch";
import { translatePlugin } from "./translate";
import { GQuickPlugin } from "./types";

export const plugins: GQuickPlugin[] = [
  appLauncherPlugin,
  fileSearchPlugin,
  calculatorPlugin,
  dockerPlugin,
  webSearchPlugin,
  translatePlugin,
];

export * from "./types";
