// 测试修复效果的脚本
// 运行方式：在浏览器控制台中执行

// 测试用例1：验证保存弹窗输入框焦点问题
async function testSaveDialogFocus() {
  console.log('测试保存弹窗输入框焦点问题...');
  
  // 模拟新建项目
  const newProjectBtn = document.querySelector('.bp-toolbar-btn:nth-child(1)');
  if (newProjectBtn) {
    newProjectBtn.click();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 模拟按下 Ctrl+S
    const saveEvent = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true
    });
    document.dispatchEvent(saveEvent);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 检查输入框是否获取焦点
    const saveInput = document.querySelector('.bp-input');
    if (saveInput === document.activeElement) {
      console.log('✓ 保存弹窗输入框成功获取焦点');
      return true;
    } else {
      console.log('✗ 保存弹窗输入框未能获取焦点');
      return false;
    }
  } else {
    console.log('✗ 未找到新建项目按钮');
    return false;
  }
}

// 测试用例2：验证项目列表显示问题
async function testProjectListDisplay() {
  console.log('测试项目列表显示问题...');
  
  // 打开项目加载对话框
  const loadProjectBtn = document.querySelector('.bp-toolbar-btn:nth-child(3)');
  if (loadProjectBtn) {
    loadProjectBtn.click();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 检查项目列表是否正确显示
    const projectItems = document.querySelectorAll('.bp-project-item');
    if (projectItems.length > 0) {
      console.log(`✓ 项目列表显示正常，共 ${projectItems.length} 个项目`);
      
      // 尝试加载第一个项目
      const firstProject = projectItems[0];
      if (firstProject) {
        const projectMain = firstProject.querySelector('.bp-project-main');
        if (projectMain) {
          projectMain.click();
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const loadBtn = document.querySelector('.bp-btn.primary');
          if (loadBtn) {
            loadBtn.click();
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log('✓ 项目加载成功');
            
            // 再次打开项目列表，检查是否更新
            loadProjectBtn.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const updatedProjectItems = document.querySelectorAll('.bp-project-item');
            if (updatedProjectItems.length > 0) {
              console.log(`✓ 项目列表更新成功，共 ${updatedProjectItems.length} 个项目`);
              return true;
            } else {
              console.log('✗ 项目列表更新失败');
              return false;
            }
          }
        }
      }
    } else {
      console.log('✗ 项目列表为空');
      return false;
    }
  } else {
    console.log('✗ 未找到加载项目按钮');
    return false;
  }
}

// 运行所有测试
async function runTests() {
  console.log('开始运行测试...');
  
  const test1Result = await testSaveDialogFocus();
  const test2Result = await testProjectListDisplay();
  
  console.log('\n测试结果汇总：');
  console.log(`保存弹窗输入框焦点测试: ${test1Result ? '通过' : '失败'}`);
  console.log(`项目列表显示测试: ${test2Result ? '通过' : '失败'}`);
  
  if (test1Result && test2Result) {
    console.log('\n✓ 所有测试通过，修复成功！');
  } else {
    console.log('\n✗ 部分测试失败，需要进一步检查');
  }
}

// 导出测试函数
if (typeof window !== 'undefined') {
  window.runFixTests = runTests;
  console.log('测试函数已加载，可在控制台执行 runFixTests() 运行测试');
} else {
  console.log('此脚本应在浏览器控制台中运行');
}
