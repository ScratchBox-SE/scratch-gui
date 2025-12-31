// This file defines all GUI themes available in the Scratch GUI

// The GUI pulls from here, you only need to update this file to add a new GUI theme

import * as guiLight from './gui/light';
import * as guiDark from './gui/dark';
import * as guiMidnight from './gui/midnight';
import * as guiScratchBoxDark from './gui/scratchbox-dark.js';
import * as guiScratchBoxLight from './gui/scratchbox-light.js';

const GUI_LIGHT = 'light';
const GUI_DARK = 'dark';
const GUI_MIDNIGHT = 'midnight';
const GUI_SCRATCHBOX_DARK = "scratchbox-dark";
const GUI_SCRATCHBOX_LIGHT = "scratchbox-light";

const GUI_MAP = {
    [GUI_LIGHT]: guiLight,
    [GUI_DARK]: guiDark,
    [GUI_MIDNIGHT]: guiMidnight,
    [GUI_SCRATCHBOX_DARK]: guiScratchBoxDark,
    [GUI_SCRATCHBOX_LIGHT]: guiScratchBoxLight
};
const GUI_DEFAULT = GUI_SCRATCHBOX_LIGHT;

export {
    GUI_MAP,
    GUI_DEFAULT
};
