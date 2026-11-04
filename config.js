// ============================================================================
// Heartbeat Games settings
// ----------------------------------------------------------------------------
// This is the one place to change settings. The launcher reads the sensor
// IDs from this file too, so a replaced sensor only needs changing here.
// After editing, close the games (Alt + F4) and start them again.
// ============================================================================

window.HG_CONFIG = {
  // The ID printed on each sensor, shown after "Polar Sense" (8 characters).
  sensors: { 1: "22B4EA3A", 2: "22B27C35" },

  // Motion samples per second in fast motion mode: 52, 104, 208 or 416.
  sampleRate: 416,

  // Default length of a game round, in seconds (a game can choose its own).
  roundSeconds: 30
};
