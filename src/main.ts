import App from './App.vue'
import router from '@/router'
import store from '@/store'
import { createApp } from 'vue'

const app = createApp(App)
app
  .use(store)
  .use(router)
  .mount('#app')

// app.config.errorHandler = (err, instance, info) => {
//   console.log('error handling: ', err, ' instance: ', instance)
//   console.log(' instance: ', instance)
// }
