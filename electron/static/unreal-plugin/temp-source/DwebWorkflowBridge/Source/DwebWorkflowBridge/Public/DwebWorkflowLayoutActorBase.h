#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "DwebWorkflowLayoutActorBase.generated.h"

class UMaterialInterface;
class UStaticMesh;

USTRUCT(BlueprintType)
struct FDwebWorkflowMaterialOverride
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FName MaterialSlotName;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	TObjectPtr<UMaterialInterface> MaterialInterface = nullptr;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString MaterialAssetPath;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	bool bEnabled = true;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString Source;
};

USTRUCT(BlueprintType)
struct FDwebWorkflowLayoutTransform
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FVector ScenePosition = FVector::ZeroVector;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FRotator SceneRotation = FRotator::ZeroRotator;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FVector SceneScale = FVector(1.0f, 1.0f, 1.0f);

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FRotator OrientationOffset = FRotator::ZeroRotator;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FTransform RelativeTransform = FTransform::Identity;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FTransform WorldTransform = FTransform::Identity;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString FitMode;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString FillMode;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString PreviewScaleMode;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	int32 FillCount = 1;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	float FillAxisScale = 1.0f;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	int32 FillCloneIndex = 0;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	int32 FillCloneCount = 1;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	bool bFillClone = false;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	bool bDerivedFromPreview = true;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString SourceLayoutItemId;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString ParentLayoutItemId;
};

USTRUCT(BlueprintType)
struct FDwebWorkflowLayoutSurfaceSemantics
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString Category;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString Placement;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString SupportSurface;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString MountType;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString WallRole;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString Anchor;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString SemanticRole;
};

USTRUCT(BlueprintType)
struct FDwebWorkflowLayoutParentReference
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString Mode;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString TargetObjectId;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString TargetSlotId;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString ParentAnchor;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString ChildAnchor;
};

USTRUCT(BlueprintType)
struct FDwebWorkflowLayoutConstraintDiagnostics
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString ExportMode;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	TArray<FString> Notes;
};

USTRUCT(BlueprintType)
struct FDwebWorkflowLayoutSlot
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString SlotId;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString ParentSlotId;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString DisplayName;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString SourceObjectId;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString SourceObjectName;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString ParentSourceObjectId;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString SourceSlotId;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	TObjectPtr<UStaticMesh> StaticMeshAsset = nullptr;

	UPROPERTY(VisibleAnywhere, Category = "Dweb Layout")
	FString StaticMeshAssetPath;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FDwebWorkflowLayoutTransform TransformData;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FTransform MeshRelativeTransform = FTransform::Identity;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FDwebWorkflowLayoutSurfaceSemantics SurfaceSemantics;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FDwebWorkflowLayoutParentReference ParentReference;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FDwebWorkflowLayoutConstraintDiagnostics ConstraintDiagnostics;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FVector PlaceholderSize = FVector::ZeroVector;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FVector WorldBoundsSize = FVector::ZeroVector;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FVector PlaceholderBoundsSize = FVector::ZeroVector;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	TArray<FDwebWorkflowMaterialOverride> MaterialOverrides;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	TArray<FString> Tags;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString Notes;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString SourceModelPath;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	FString SourceBindingType;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	int64 LastImportedAt = 0;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	bool bDerivedSlot = false;

	UPROPERTY(EditAnywhere, Category = "Dweb Layout")
	bool bEnabled = true;
};

USTRUCT(BlueprintType)
struct FDwebWorkflowLayoutImportSummary
{
	GENERATED_BODY()

	UPROPERTY(VisibleAnywhere, Category = "Dweb Layout")
	FString LastImportJobId;

	UPROPERTY(VisibleAnywhere, Category = "Dweb Layout")
	FString BlueprintAssetPath;

	UPROPERTY(VisibleAnywhere, Category = "Dweb Layout")
	FString ModelsAssetPath;

	UPROPERTY(VisibleAnywhere, Category = "Dweb Layout")
	FString ActorBaseClass;

	UPROPERTY(VisibleAnywhere, Category = "Dweb Layout")
	int32 LayoutProtocolVersion = 1;

	UPROPERTY(VisibleAnywhere, Category = "Dweb Layout")
	int32 SlotCount = 0;

	UPROPERTY(VisibleAnywhere, Category = "Dweb Layout")
	int32 AppliedSlotCount = 0;

	UPROPERTY(VisibleAnywhere, Category = "Dweb Layout")
	int32 MaterialOverrideCount = 0;

	UPROPERTY(VisibleAnywhere, Category = "Dweb Layout")
	int32 SkippedSlotCount = 0;

	UPROPERTY(VisibleAnywhere, Category = "Dweb Layout")
	TArray<FString> Warnings;
};

UCLASS(Blueprintable)
class DWEBWORKFLOWBRIDGE_API ADwebWorkflowLayoutActorBase : public AActor
{
	GENERATED_BODY()

public:
	ADwebWorkflowLayoutActorBase();

	UPROPERTY(EditAnywhere, Category = "Dweb Layout", meta = (TitleProperty = "DisplayName"))
	TArray<FDwebWorkflowLayoutSlot> LayoutSlots;

	UPROPERTY(VisibleAnywhere, Category = "Dweb Layout")
	FDwebWorkflowLayoutImportSummary ImportSummary;

	UPROPERTY(VisibleAnywhere, Category = "Dweb Debug")
	FString LastImportJobId;
};
