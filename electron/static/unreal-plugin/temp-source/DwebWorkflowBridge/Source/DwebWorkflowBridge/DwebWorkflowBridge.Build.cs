using UnrealBuildTool;

public class DwebWorkflowBridge : ModuleRules
{
	public DwebWorkflowBridge(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new[]
		{
			"Core",
			"HTTP",
			"Json",
			"JsonUtilities"
		});

		PrivateDependencyModuleNames.AddRange(new[]
		{
			"AssetRegistry",
			"AssetTools",
			"CoreUObject",
			"Engine",
			"InterchangeCore",
			"InterchangeEngine",
			"UnrealEd",
			"Slate",
			"SlateCore",
			"InputCore",
			"Projects",
			"ToolMenus",
			"LevelEditor"
		});
	}
}