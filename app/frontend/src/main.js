import Vue from "vue";
import { BootstrapVue, BootstrapVueIcons } from "bootstrap-vue";

import App from "./App.vue";
import router from "./router";

import "bootstrap/dist/css/bootstrap.css";
import "bootstrap-vue/dist/bootstrap-vue.css";
import "@/css/bootswatch-lumen.css";
import "@/css/n-plus.css";

Vue.config.productionTip = false;
Vue.prototype.$apiUrl = "/api";
Vue.use(BootstrapVue);
Vue.use(BootstrapVueIcons);

new Vue({
  el: "#app",
  router,
  render: h => h(App)
});
