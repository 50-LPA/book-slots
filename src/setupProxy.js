// Local `npm start` only (CRA dev server): it has no Netlify functions, so forward them to the live site's.
// They act on the same Firebase project as local dev already does. `netlify dev` serves them locally instead.
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = (app) => {
  app.use('/.netlify/functions', createProxyMiddleware({ target: 'https://book-slots.netlify.app', changeOrigin: true }));
};
