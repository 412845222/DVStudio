#pragma once

#include "Containers/Ticker.h"
#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

class FAutoConsoleCommand;
class AActor;
class FJsonObject;
class FReply;
struct FDwebWorkflowLayoutSlot;
class SDockTab;
template <typename OptionType> class SComboBox;
class UWorld;

class FDwebWorkflowBridgeModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;

private:
	void RegisterMenus();
	void OpenPluginWindow();
	TSharedRef<SDockTab> OnSpawnPluginTab(const class FSpawnTabArgs& SpawnTabArgs);

	FReply OnConnectWorkflowClicked();
	FReply OnCheckConnectionClicked();
	FReply OnReceiveLayoutClicked();
	FReply OnReceiveLightingClicked();

	void RegisterSession();
	void SendHeartbeat();
	void PollNextJob(bool bSilentIfEmpty);
	void UpdateJobStatus(const FString& JobId, const FString& Status, const FString& Message, const TSharedPtr<FJsonObject>& ResultData = nullptr);
	bool ExecuteExportJob(const TSharedPtr<FJsonObject>& JobObject, FString& OutMessage, TSharedPtr<FJsonObject>& OutResultData);
	bool ExecuteLightingOnlyJob(const FString& JobId, const FString& SceneName, const TSharedPtr<FJsonObject>& ExportPayload, FString& OutMessage, TSharedPtr<FJsonObject>& OutResultData);
	UWorld* GetEditorWorld() const;
	bool EnsureDirectoryExists(const FString& InDirectory, FString& OutError) const;
	bool SaveJobManifest(const FString& JobId, const TSharedPtr<FJsonObject>& ExportPayload, FString& OutManifestPath, FString& OutError) const;
	bool SaveJsonFile(const FString& OutputPath, const TSharedPtr<FJsonObject>& JsonObject, FString& OutError) const;
	bool ImportReferencedModelAssets(const FString& JobId, const TSharedPtr<FJsonObject>& ExportPayload, const FString& ModelsAssetPath, TArray<TSharedPtr<FJsonValue>>& OutImportedAssets, int32& OutImportedAssetCount, int32& OutPendingDownloadCount, FString& OutError);
	bool ImportSingleModelAsset(const FString& SourceFilePath, const FString& ModelsAssetPath, const FString& DesiredAssetName, FString& OutImportedAssetPath, FString& OutError);
	bool ResolveBindingLocalModelSourcePath(const TSharedPtr<FJsonObject>& BindingObject, const TSharedPtr<FJsonObject>& ManualBindingObject, FString& OutSourceFilePath, FString& OutSourceLabel, bool& bOutRequiresDownload) const;
	bool CreateSceneBlueprintShell(const FString& SceneContentPath, const FString& BlueprintAssetName, FString& OutBlueprintAssetPath, FString& OutError);
	bool AssembleSceneBlueprintComponents(const FString& JobId, const FString& BlueprintAssetPath, const FString& ModelsAssetPath, const TArray<TSharedPtr<FJsonValue>>& ResolvedLayoutSlots, const TArray<TSharedPtr<FJsonValue>>& LayoutItems, const TArray<TSharedPtr<FJsonValue>>& ImportedAssets, int32 LayoutProtocolVersion, int32& OutAssembledComponentCount, int32& OutMaterialOverrideCount, int32& OutSkippedSlotCount, FString& OutError);
	FString BuildSceneContentPath(const FString& SceneName) const;
	FString SanitizeIdentifier(const FString& InValue, const FString& Prefix = TEXT("Item")) const;
	bool SpawnSceneLayoutActors(UWorld* World, const FString& SceneName, const TArray<TSharedPtr<FJsonValue>>& LayoutItems, const TArray<TSharedPtr<FJsonValue>>& ModelBindings, int32& OutSpawnedActorCount, int32& OutPendingModelCount, FString& OutError);
	bool SpawnLightingActors(UWorld* World, const FString& SceneName, const TSharedPtr<FJsonObject>& LightingPayload, AActor* AnchorActor, int32& OutSpawnedLightCount, FString& OutError);
	void RefreshSceneActorOptions();
	AActor* ResolveSelectedSceneActor() const;
	FText BuildSelectedSceneActorText() const;
	bool HandleHeartbeatTick(float DeltaTime);

	void AppendLog(const FString& Line);
	void UpdateConnectionStatus(const FString& InStatus);
	FString BuildApiUrl(const FString& Path) const;
	bool ParseJson(const FString& Text, TSharedPtr<FJsonObject>& OutObject) const;
	FString SanitizeFileName(const FString& InValue) const;
	bool LoadConnectionConfig();
	FString GetConnectionConfigPath() const;

	static const FName BridgeTabName;

	TSharedPtr<SComboBox<TSharedPtr<FString>>> SceneActorComboBox;
	TArray<TSharedPtr<FString>> SceneActorOptions;

	TUniquePtr<FAutoConsoleCommand> OpenTabConsoleCommand;
	FTSTicker::FDelegateHandle HeartbeatTickerHandle;

	FString BackendUrl;
	FString AssetRootPath;
	FString SelectedSceneActorPath;
	FString SessionId;
	FString ConnectionStatus;
	FString CurrentStageText;
	float CurrentProgressPercent = 0.0f;
	FString LatestLog;
	bool bHeartbeatInFlight = false;
};