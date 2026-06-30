#include "DwebWorkflowLayoutActorBase.h"

#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"

namespace
{
	const FName DwebGeneratedSlotNodeTag(TEXT("DwebGeneratedSlotNode"));
	const FName DwebGeneratedSurfaceNodeTag(TEXT("DwebGeneratedSurfaceNode"));
	const FName DwebGeneratedMeshTag(TEXT("DwebGeneratedSlotMesh"));
}

ADwebWorkflowLayoutActorBase::ADwebWorkflowLayoutActorBase()
{
	PrimaryActorTick.bCanEverTick = false;
	bRunConstructionScriptOnDrag = false;

	USceneComponent* SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("LayoutRoot"));
	SceneRoot->SetMobility(EComponentMobility::Movable);
	SetRootComponent(SceneRoot);
}

void ADwebWorkflowLayoutActorBase::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);

	if (HasAnyFlags(RF_ClassDefaultObject))
	{
		return;
	}

	ApplyLayoutSlotsToComponents();
}

void ADwebWorkflowLayoutActorBase::RebuildLayoutActor()
{
	if (HasAnyFlags(RF_ClassDefaultObject))
	{
		return;
	}

#if WITH_EDITOR
	Modify();
	RerunConstructionScripts();
#else
	ApplyLayoutSlotsToComponents();
#endif
}

#if WITH_EDITOR
void ADwebWorkflowLayoutActorBase::PostEditChangeProperty(FPropertyChangedEvent& PropertyChangedEvent)
{
	Super::PostEditChangeProperty(PropertyChangedEvent);

	if (HasAnyFlags(RF_ClassDefaultObject) || !bAutoRebuildOnPropertyChange)
	{
		return;
	}

	const FName PropertyName = PropertyChangedEvent.GetPropertyName();
	if (PropertyName == GET_MEMBER_NAME_CHECKED(ADwebWorkflowLayoutActorBase, GeneratedMeshComponents))
	{
		return;
	}

	RebuildLayoutActor();
}
#endif

void ADwebWorkflowLayoutActorBase::ApplyLayoutSlotsToComponents()
{
	ClearGeneratedComponents();

	USceneComponent* SceneRoot = GetRootComponent();
	if (!SceneRoot)
	{
		SceneRoot = NewObject<USceneComponent>(this, TEXT("LayoutRootRuntime"), RF_Transactional);
		SceneRoot->SetMobility(EComponentMobility::Movable);
		SetRootComponent(SceneRoot);
		AddInstanceComponent(SceneRoot);
		SceneRoot->RegisterComponent();
	}

	TMap<FString, USceneComponent*> SlotNodesById;
	SlotNodesById.Reserve(LayoutSlots.Num());
	TMap<FString, USceneComponent*> SurfaceNodesById;
	SurfaceNodesById.Reserve(LayoutSlots.Num());

	for (int32 SlotIndex = 0; SlotIndex < LayoutSlots.Num(); ++SlotIndex)
	{
		const FDwebWorkflowLayoutSlot& Slot = LayoutSlots[SlotIndex];
		if (!Slot.bEnabled)
		{
			continue;
		}

		USceneComponent* SlotNode = NewObject<USceneComponent>(this, BuildSlotNodeComponentName(Slot, SlotIndex), RF_Transactional);
		if (!SlotNode)
		{
			continue;
		}

		SlotNode->ComponentTags.Add(DwebGeneratedSlotNodeTag);
		SlotNode->CreationMethod = EComponentCreationMethod::UserConstructionScript;
		SlotNode->SetMobility(EComponentMobility::Movable);
		AddInstanceComponent(SlotNode);
		SlotNodesById.Add(Slot.SlotId, SlotNode);
		GeneratedSlotComponents.Add(SlotNode);

		USceneComponent* SurfaceNode = NewObject<USceneComponent>(this, BuildSurfaceNodeComponentName(Slot, SlotIndex), RF_Transactional);
		if (!SurfaceNode)
		{
			continue;
		}

		SurfaceNode->ComponentTags.Add(DwebGeneratedSurfaceNodeTag);
		SurfaceNode->CreationMethod = EComponentCreationMethod::UserConstructionScript;
		SurfaceNode->SetMobility(EComponentMobility::Movable);
		AddInstanceComponent(SurfaceNode);
		SurfaceNodesById.Add(Slot.SlotId, SurfaceNode);
		GeneratedSlotComponents.Add(SurfaceNode);
	}

	for (int32 SlotIndex = 0; SlotIndex < LayoutSlots.Num(); ++SlotIndex)
	{
		const FDwebWorkflowLayoutSlot& Slot = LayoutSlots[SlotIndex];
		if (!Slot.bEnabled)
		{
			continue;
		}

		USceneComponent* const* SlotNodePtr = SlotNodesById.Find(Slot.SlotId);
		USceneComponent* SlotNode = SlotNodePtr ? *SlotNodePtr : nullptr;
		if (!SlotNode)
		{
			continue;
		}

		USceneComponent* ParentNode = SceneRoot;
		if (!Slot.ParentSlotId.TrimStartAndEnd().IsEmpty())
		{
			if (USceneComponent* const* ParentNodePtr = SurfaceNodesById.Find(Slot.ParentSlotId))
			{
				ParentNode = *ParentNodePtr;
			}
		}

		SlotNode->SetupAttachment(ParentNode);
		SlotNode->SetRelativeTransform(Slot.TransformData.RelativeTransform);
		SlotNode->OnComponentCreated();
		SlotNode->RegisterComponent();

		USceneComponent* const* SurfaceNodePtr = SurfaceNodesById.Find(Slot.SlotId);
		USceneComponent* SurfaceNode = SurfaceNodePtr ? *SurfaceNodePtr : nullptr;
		if (!SurfaceNode)
		{
			continue;
		}

		SurfaceNode->SetupAttachment(SlotNode);
		SurfaceNode->SetRelativeTransform(FTransform::Identity);
		SurfaceNode->OnComponentCreated();
		SurfaceNode->RegisterComponent();

		if (!Slot.StaticMeshAsset)
		{
			continue;
		}

		UStaticMeshComponent* MeshComponent = NewObject<UStaticMeshComponent>(this, BuildSlotComponentName(Slot, SlotIndex), RF_Transactional);
		if (!MeshComponent)
		{
			continue;
		}

		MeshComponent->ComponentTags.Add(DwebGeneratedMeshTag);
		MeshComponent->CreationMethod = EComponentCreationMethod::UserConstructionScript;
		MeshComponent->SetupAttachment(SurfaceNode);
		MeshComponent->SetMobility(EComponentMobility::Movable);
		MeshComponent->SetStaticMesh(Slot.StaticMeshAsset);
		MeshComponent->SetRelativeTransform(Slot.MeshRelativeTransform);

		for (const FDwebWorkflowMaterialOverride& MaterialOverride : Slot.MaterialOverrides)
		{
			if (!MaterialOverride.bEnabled || !MaterialOverride.MaterialInterface)
			{
				continue;
			}

			const int32 MaterialIndex = !MaterialOverride.MaterialSlotName.IsNone()
				? MeshComponent->GetMaterialIndex(MaterialOverride.MaterialSlotName)
				: 0;
			if (MaterialIndex >= 0)
			{
				MeshComponent->SetMaterial(MaterialIndex, MaterialOverride.MaterialInterface);
			}
		}

		AddInstanceComponent(MeshComponent);
		MeshComponent->OnComponentCreated();
		MeshComponent->RegisterComponent();
		GeneratedMeshComponents.Add(MeshComponent);
	}

	LastImportJobId = ImportSummary.LastImportJobId;
}

void ADwebWorkflowLayoutActorBase::ClearGeneratedComponents()
{
	TInlineComponentArray<USceneComponent*> SceneComponents(this);
	for (USceneComponent* SceneComponent : SceneComponents)
	{
		if (!SceneComponent)
		{
			continue;
		}
		const bool bGeneratedNode = SceneComponent->ComponentHasTag(DwebGeneratedSlotNodeTag);
		const bool bGeneratedSurface = SceneComponent->ComponentHasTag(DwebGeneratedSurfaceNodeTag);
		const bool bGeneratedMesh = SceneComponent->ComponentHasTag(DwebGeneratedMeshTag);
		if (!bGeneratedNode && !bGeneratedSurface && !bGeneratedMesh)
		{
			continue;
		}

		RemoveInstanceComponent(SceneComponent);
		SceneComponent->DestroyComponent();
	}

	GeneratedSlotComponents.Reset();
	GeneratedMeshComponents.Reset();
}

FName ADwebWorkflowLayoutActorBase::BuildSlotNodeComponentName(const FDwebWorkflowLayoutSlot& Slot, int32 SlotIndex) const
{
	FString BaseName = Slot.SlotId.TrimStartAndEnd();
	if (BaseName.IsEmpty())
	{
		BaseName = Slot.DisplayName.TrimStartAndEnd();
	}
	if (BaseName.IsEmpty())
	{
		BaseName = FString::Printf(TEXT("SlotNode_%d"), SlotIndex + 1);
	}
	BaseName.ReplaceInline(TEXT(" "), TEXT("_"));
	BaseName.ReplaceInline(TEXT("-"), TEXT("_"));
	return FName(*FString::Printf(TEXT("DwebSlot_%s"), *BaseName));
}

FName ADwebWorkflowLayoutActorBase::BuildSurfaceNodeComponentName(const FDwebWorkflowLayoutSlot& Slot, int32 SlotIndex) const
{
	FString BaseName = Slot.SlotId.TrimStartAndEnd();
	if (BaseName.IsEmpty())
	{
		BaseName = Slot.DisplayName.TrimStartAndEnd();
	}
	if (BaseName.IsEmpty())
	{
		BaseName = FString::Printf(TEXT("Surface_%d"), SlotIndex + 1);
	}
	BaseName.ReplaceInline(TEXT(" "), TEXT("_"));
	BaseName.ReplaceInline(TEXT("-"), TEXT("_"));
	return FName(*FString::Printf(TEXT("DwebSurface_%s"), *BaseName));
}

FName ADwebWorkflowLayoutActorBase::BuildSlotComponentName(const FDwebWorkflowLayoutSlot& Slot, int32 SlotIndex) const
{
	FString BaseName = Slot.SlotId.TrimStartAndEnd();
	if (BaseName.IsEmpty())
	{
		BaseName = Slot.DisplayName.TrimStartAndEnd();
	}
	if (BaseName.IsEmpty())
	{
		BaseName = FString::Printf(TEXT("Slot_%d"), SlotIndex + 1);
	}
	BaseName.ReplaceInline(TEXT(" "), TEXT("_"));
	BaseName.ReplaceInline(TEXT("-"), TEXT("_"));
	return FName(*FString::Printf(TEXT("Dweb_%s"), *BaseName));
}