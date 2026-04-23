import { appLauncherPlugin } from "./appLauncher";
import { calculatorPlugin } from "./calculator";
import { dockerPlugin } from "./docker";
import { webSearchPlugin } from "./webSearch";
import { fileSearchPlugin } from "./fileSearch";
import { translatePlugin } from "./translate";
import { notesPlugin } from "./notes";
import { GQuickPlugin } from "./types";

export const plugins: GQuickPlugin[] = [
  appLauncherPlugin,
  fileSearchPlugin,
  calculatorPlugin,
  dockerPlugin,
  webSearchPlugin,
  translatePlugin,
  notesPlugin,
];

export * from "./types";
