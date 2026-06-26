import { ref } from 'vue'

const aboutOpen = ref(false)

export function openAboutDialog() {
	aboutOpen.value = true
}

export function closeAboutDialog() {
	aboutOpen.value = false
}

export function useAboutDialog() {
	return {
		aboutOpen,
		openAboutDialog,
		closeAboutDialog,
	}
}
