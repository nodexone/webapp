import App from './App.vue'
import router from '@/router'
import { createApp } from 'vue'
import '@/index.css'
import '@/assets/styles/global.scss'
import { store } from '@/store'
import { createI18n } from 'vue-i18n'
import { messages } from '@/i18n'

const i18n = createI18n({
  locale: 'en',
  fallbackLocale: 'en',
  messages: messages
  // something vue-i18n options here ...
})

const app = createApp(App)
app.use(store)
  .use(i18n)
  .use(router)
  .mount('#app')
