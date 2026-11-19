require('./lib/billing').startBillingReconciler();
const app = require('./server');
void require('./lib/ssweb-prepare').prepareScreenshot();
void require('./lib/hd-runtime').prepareHD();
const { port } = require('./config');

app.listen(port, '0.0.0.0', () => {
  console.log(`[RED API] Server listening on port ${port}`);
});
