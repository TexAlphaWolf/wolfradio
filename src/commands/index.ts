import { config } from "../config.js";
import { filter, leave, loop, pause, shuffle, skip, stop, volume } from "./controls.js";
import { help } from "./help.js";
import { party } from "./party.js";
import { play } from "./play.js";
import { clear, nowplaying, queue, remove } from "./queue.js";
import { radio } from "./radio.js";
import { random } from "./random.js";
import { setup } from "./setup.js";
import type { Command } from "./types.js";

const list: Command[] = [
  play,
  ...(config.library.enabled ? [random] : []),
  ...(config.radio.enabled ? [radio] : []),
  ...(config.spotify.enabled ? [party] : []),
  queue,
  nowplaying,
  remove,
  clear,
  skip,
  pause,
  stop,
  leave,
  loop,
  shuffle,
  volume,
  filter,
  setup,
  help,
];

export const commands = new Map(list.map((c) => [c.data.name, c]));
