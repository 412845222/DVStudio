import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ToolCallCard from '@/ui/AIChat/ToolCallCard.vue'

describe('ToolCallCard', () => {
  const getBodyStyle = (wrapper: any) => {
    return wrapper.find('.tool-call-card__body').attributes('style') || ''
  }

  describe('rendering', () => {
    it('renders with basic props', () => {
      const wrapper = mount(ToolCallCard, {
        props: {
          toolName: 'test_tool',
          status: 'pending',
        },
      })
      expect(wrapper.find('.tool-call-card').exists()).toBe(true)
      expect(wrapper.find('.tool-call-card__header').exists()).toBe(true)
    })

    it('displays tool name with underscores replaced by spaces', () => {
      const wrapper = mount(ToolCallCard, {
        props: {
          toolName: 'get_blueprint_state',
          status: 'pending',
        },
      })
      expect(wrapper.find('.tool-call-card__name').text()).toContain('get blueprint state')
    })

    it('handles empty tool name', () => {
      const wrapper = mount(ToolCallCard, {
        props: {
          toolName: '',
          status: 'pending',
        },
      })
      expect(wrapper.find('.tool-call-card__name').text()).toContain('unknown')
    })
  })

  describe('status display', () => {
    it('shows "等待中" label for pending status', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'pending' },
      })
      expect(wrapper.find('.tool-call-card__status-text').text()).toContain('等待中')
    })

    it('shows "执行中" label for running status', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'running' },
      })
      expect(wrapper.find('.tool-call-card__status-text').text()).toContain('执行中')
    })

    it('shows "已完成" label for completed status', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'completed' },
      })
      expect(wrapper.find('.tool-call-card__status-text').text()).toContain('已完成')
    })

    it('shows "出错" label for error status', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'error' },
      })
      expect(wrapper.find('.tool-call-card__status-text').text()).toContain('出错')
    })

    it('has status-pending class for pending', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'pending' },
      })
      expect(wrapper.find('.tool-call-card').classes()).toContain('status-pending')
    })

    it('has status-running class for running', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'running' },
      })
      expect(wrapper.find('.tool-call-card').classes()).toContain('status-running')
    })

    it('has status-completed class for completed', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'completed' },
      })
      expect(wrapper.find('.tool-call-card').classes()).toContain('status-completed')
    })

    it('has status-error class for error', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'error' },
      })
      expect(wrapper.find('.tool-call-card').classes()).toContain('status-error')
    })
  })

  describe('status icons', () => {
    it('shows spinner for pending status', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'pending' },
      })
      expect(wrapper.find('.tool-call-card__spinner').exists()).toBe(true)
    })

    it('shows spinner for running status', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'running' },
      })
      expect(wrapper.find('.tool-call-card__spinner').exists()).toBe(true)
    })

    it('shows check icon for completed status', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'completed' },
      })
      expect(wrapper.find('.tool-call-card__icon-check').exists()).toBe(true)
    })

    it('shows error icon for error status', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'error' },
      })
      expect(wrapper.find('.tool-call-card__icon-error').exists()).toBe(true)
    })
  })

  describe('expanded state', () => {
    it('is collapsed by default', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'completed', args: { key: 'value' } },
      })
      expect(getBodyStyle(wrapper)).toContain('display: none')
    })

    it('is expanded when defaultExpanded is true', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'completed', args: { key: 'value' }, defaultExpanded: true },
      })
      expect(getBodyStyle(wrapper)).not.toContain('display: none')
    })

    it('toggles expanded state when header is clicked', async () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'completed', args: { key: 'value' } },
      })
      expect(getBodyStyle(wrapper)).toContain('display: none')

      await wrapper.find('.tool-call-card__header').trigger('click')
      await wrapper.vm.$nextTick()
      expect(getBodyStyle(wrapper)).not.toContain('display: none')

      await wrapper.find('.tool-call-card__header').trigger('click')
      await wrapper.vm.$nextTick()
      expect(getBodyStyle(wrapper)).toContain('display: none')
    })

    it('toggle svg has expanded class when expanded', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'completed', defaultExpanded: true },
      })
      const toggleSvg = wrapper.find('.tool-call-card__toggle svg')
      expect(toggleSvg.classes()).toContain('expanded')
    })

    it('toggle svg does not have expanded class when collapsed', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'completed' },
      })
      const toggleSvg = wrapper.find('.tool-call-card__toggle svg')
      expect(toggleSvg.classes()).not.toContain('expanded')
    })
  })

  describe('args display', () => {
    it('does not show args section when args is undefined', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'completed', defaultExpanded: true },
      })
      expect(wrapper.find('.tool-call-card__section').exists()).toBe(false)
    })

    it('does not show args section when args is empty object', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'completed', args: {}, defaultExpanded: true },
      })
      const sections = wrapper.findAll('.tool-call-card__section')
      const argsSection = sections.find(s => s.text().includes('参数'))
      expect(argsSection).toBeUndefined()
    })

    it('shows args section when args has values', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'completed', args: { key: 'value' }, defaultExpanded: true },
      })
      const sections = wrapper.findAll('.tool-call-card__section')
      const argsSection = sections.find(s => s.text().includes('参数'))
      expect(argsSection).toBeDefined()
    })

    it('formats args as JSON', () => {
      const args = { name: 'test', count: 42 }
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'completed', args, defaultExpanded: true },
      })
      const codeBlock = wrapper.find('.tool-call-card__code')
      expect(codeBlock.text()).toContain('"name": "test"')
      expect(codeBlock.text()).toContain('"count": 42')
    })
  })

  describe('result display', () => {
    it('shows result section when status is completed and result is provided', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'completed', result: 'success', defaultExpanded: true },
      })
      const sections = wrapper.findAll('.tool-call-card__section')
      const resultSection = sections.find(s => s.text().includes('结果'))
      expect(resultSection).toBeDefined()
    })

    it('does not show result section when status is not completed', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'running', result: 'some result', defaultExpanded: true },
      })
      const sections = wrapper.findAll('.tool-call-card__section')
      const resultSection = sections.find(s => s.text().includes('结果'))
      expect(resultSection).toBeUndefined()
    })

    it('does not show result section when result is undefined', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'completed', defaultExpanded: true },
      })
      const sections = wrapper.findAll('.tool-call-card__section')
      const resultSection = sections.find(s => s.text().includes('结果'))
      expect(resultSection).toBeUndefined()
    })

    it('shows string result directly', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'completed', result: 'done', defaultExpanded: true },
      })
      const resultCode = wrapper.find('.tool-call-card__code--result')
      expect(resultCode.text()).toContain('done')
    })

    it('formats object result as JSON', () => {
      const result = { success: true, data: { id: 1 } }
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'completed', result, defaultExpanded: true },
      })
      const resultCode = wrapper.find('.tool-call-card__code--result')
      expect(resultCode.text()).toContain('"success": true')
      expect(resultCode.text()).toContain('"id": 1')
    })
  })

  describe('error display', () => {
    it('shows error section when status is error and error message is provided', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'error', error: 'Something went wrong', defaultExpanded: true },
      })
      const sections = wrapper.findAll('.tool-call-card__section')
      const errorSection = sections.find(s => s.text().includes('错误'))
      expect(errorSection).toBeDefined()
    })

    it('does not show error section when status is not error', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'completed', error: 'not an error', defaultExpanded: true },
      })
      const sections = wrapper.findAll('.tool-call-card__section')
      const errorSection = sections.find(s => s.text().includes('错误'))
      expect(errorSection).toBeUndefined()
    })

    it('does not show error section when error is empty', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'error', error: '', defaultExpanded: true },
      })
      const sections = wrapper.findAll('.tool-call-card__section')
      const errorSection = sections.find(s => s.text().includes('错误'))
      expect(errorSection).toBeUndefined()
    })

    it('displays error message', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'error', error: 'Connection timeout', defaultExpanded: true },
      })
      const errorCode = wrapper.find('.tool-call-card__code--error')
      expect(errorCode.text()).toContain('Connection timeout')
    })
  })

  describe('accessibility', () => {
    it('header is a button element', () => {
      const wrapper = mount(ToolCallCard, {
        props: { toolName: 'test', status: 'pending' },
      })
      expect(wrapper.find('.tool-call-card__header').element.tagName).toBe('BUTTON')
    })

    it('all status svgs have aria-hidden', () => {
      const statuses = ['pending', 'running', 'completed', 'error'] as const
      statuses.forEach(status => {
        const wrapper = mount(ToolCallCard, {
          props: { toolName: 'test', status },
        })
        const svgs = wrapper.findAll('svg[aria-hidden="true"]')
        expect(svgs.length).toBeGreaterThanOrEqual(1)
      })
    })
  })
})
