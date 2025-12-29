import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'

// 全局拦截浏览器默认交互：避免右键菜单/保存网页干扰编辑器体验
window.addEventListener('contextmenu', (e) => {
	e.preventDefault()
})

window.addEventListener(
	'keydown',
	(e) => {
		// Ctrl+S / Cmd+S: 阻止浏览器“保存网页”
		if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
			e.preventDefault()
			e.stopPropagation()
		}
	},
	{ capture: true }
)

createApp(App).use(router).mount('#app')
