import { createApp } from 'vue'
import naive from 'naive-ui'
import { createPinia } from 'pinia'
import router from './router'
import axios from 'axios'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate' // 引入插件
import VueDragSelect from "@coleqiu/vue-drag-select";


import './assets/styles/fonts.css'

axios.defaults.baseURL = 'http://localhost:8080'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate) // 注册持久化插件


import App from './App.vue'

const app = createApp(App)
app.use(naive)
app.use(router)
app.use(pinia)
app.use(VueDragSelect);
app.mount('#app')