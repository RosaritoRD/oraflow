/* The Messages module (multi-account inbox and per-video automations) is not part
   of the open-source edition. These stubs keep the app running without it: the
   routes answer 404 and the scheduled jobs do nothing. */
function noIncluido() {
  const e = new Error('The Messages module is not included in the open-source edition');
  e.status = 404;
  throw e;
}
module.exports = { noIncluido };
