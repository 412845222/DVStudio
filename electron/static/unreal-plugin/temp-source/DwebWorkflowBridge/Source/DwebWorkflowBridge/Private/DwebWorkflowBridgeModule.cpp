#include "DwebWorkflowBridgeModule.h"

#include "DwebWorkflowLayoutActorBase.h"

#include "GameFramework/Actor.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetToolsModule.h"
#include "Components/LightComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SceneComponent.h"
#include "Components/SpotLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Containers/Ticker.h"
#include "Editor.h"
#include "Selection.h"
#include "Engine/DirectionalLight.h"
#include "Engine/PointLight.h"
#include "Engine/RectLight.h"
#include "Engine/SkyLight.h"
#include "Engine/SpotLight.h"
#include "Engine/StaticMesh.h"
#include "Engine/StaticMeshActor.h"
#include "Engine/World.h"
#include "Components/RectLightComponent.h"
#include "Engine/SCS_Node.h"
#include "Engine/SimpleConstructionScript.h"
#include "Framework/Docking/TabManager.h"
#include "HAL/FileManager.h"
#include "HAL/PlatformProcess.h"
#include "IAssetTools.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "InterchangeManager.h"
#include "InterchangeSourceData.h"
#include "Kismet2/KismetEditorUtilities.h"
#include "LevelEditor.h"
#include "Math/RotationMatrix.h"
#include "EngineUtils.h"
#include "Misc/App.h"
#include "Misc/EngineVersion.h"
#include "Misc/FileHelper.h"
#include "Misc/PackageName.h"
#include "Misc/Paths.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "ToolMenus.h"
#include "Engine/Blueprint.h"
#include "Engine/BlueprintGeneratedClass.h"
#include "Widgets/Docking/SDockTab.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SComboBox.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Notifications/SProgressBar.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SSeparator.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Text/STextBlock.h"
#include "Kismet2/BlueprintEditorUtils.h"
#include "Materials/MaterialInterface.h"
#include "Materials/Material.h"
#include "Engine/Texture.h"
#include "Engine/AssetManager.h"
#include "RenderingThread.h"
#include "Engine/StreamableManager.h"
#include "ContentStreaming.h"

#define LOCTEXT_NAMESPACE "FDwebWorkflowBridgeModule"

namespace
{
	struct FDwebLightMappingRule
	{
		const TCHAR* ThreeType;
		const TCHAR* UnrealType;
		double IntensityScale;
		double MinIntensity;
		double MaxIntensity;
		double DefaultDistanceCm;
		double MinDistanceCm;
		double MaxDistanceCm;
		double DefaultWidthCm;
		double DefaultHeightCm;
	};

	static const FDwebLightMappingRule GDwebLightMappingRules[] = {
		{ TEXT("ambient"), TEXT("ASkyLight"), 0.35, 0.02, 2.8, 0.0, 0.0, 0.0, 0.0, 0.0 },
		{ TEXT("hemisphere"), TEXT("ASkyLight"), 0.45, 0.03, 3.2, 0.0, 0.0, 0.0, 0.0, 0.0 },
		{ TEXT("directional"), TEXT("ADirectionalLight"), 3.0, 0.08, 28.0, 0.0, 0.0, 0.0, 0.0, 0.0 },
		{ TEXT("spot"), TEXT("ASpotLight"), 850.0, 80.0, 12000.0, 600.0, 120.0, 2800.0, 0.0, 0.0 },
		{ TEXT("point"), TEXT("APointLight"), 620.0, 50.0, 9000.0, 520.0, 120.0, 2600.0, 0.0, 0.0 },
		{ TEXT("rect-area"), TEXT("ARectLight"), 360.0, 35.0, 6000.0, 580.0, 100.0, 2600.0, 120.0, 35.0 },
	};

	FString NormalizeDwebLightType(const FString& RawType)
	{
		FString Type = RawType.TrimStartAndEnd().ToLower();
		Type.ReplaceInline(TEXT("_"), TEXT("-"));
		if (Type == TEXT("rectarea") || Type == TEXT("rect-light") || Type == TEXT("rect-light-strip"))
		{
			return TEXT("rect-area");
		}
		if (Type == TEXT("dir"))
		{
			return TEXT("directional");
		}
		if (Type == TEXT("hemi"))
		{
			return TEXT("hemisphere");
		}
		if (Type == TEXT("area"))
		{
			return TEXT("rect-area");
		}
		return Type.IsEmpty() ? TEXT("point") : Type;
	}

	const FDwebLightMappingRule* FindDwebLightMappingRule(const FString& NormalizedType)
	{
		for (const FDwebLightMappingRule& Rule : GDwebLightMappingRules)
		{
			if (NormalizedType.Equals(Rule.ThreeType, ESearchCase::IgnoreCase))
			{
				return &Rule;
			}
		}
		return nullptr;
	}

	double ComputeMappedLightIntensity(const FDwebLightMappingRule* Rule, double ThreeIntensity)
	{
		if (!Rule)
		{
			return FMath::Max(1.0, ThreeIntensity * 500.0);
		}
		return FMath::Clamp(ThreeIntensity * Rule->IntensityScale, Rule->MinIntensity, Rule->MaxIntensity);
	}

	double ComputeMappedAttenuationCm(const FDwebLightMappingRule* Rule, double ThreeDistance)
	{
		if (!Rule || Rule->DefaultDistanceCm <= 0.0)
		{
			return FMath::Max(120.0, ThreeDistance * 100.0);
		}
		const double DistanceCm = ThreeDistance > 0.001 ? ThreeDistance * 100.0 : Rule->DefaultDistanceCm;
		return FMath::Clamp(DistanceCm, Rule->MinDistanceCm, Rule->MaxDistanceCm);
	}

	void FlushAllPendingAsyncLoading()
	{
		FlushAsyncLoading();
		IStreamingManager::Get().StreamAllResources(0.0f);
	}

	void EnsureStaticMeshFullyLoaded(UStaticMesh* StaticMesh)
	{
		if (!StaticMesh)
		{
			return;
		}

		FlushAllPendingAsyncLoading();

		const int32 MaterialCount = StaticMesh->GetStaticMaterials().Num();
		for (int32 MatIndex = 0; MatIndex < MaterialCount; ++MatIndex)
		{
			UMaterialInterface* MatInterface = StaticMesh->GetMaterial(MatIndex);
			if (!MatInterface)
			{
				continue;
			}

			MatInterface->SetFlags(RF_Public | RF_Standalone);
			UMaterial* BaseMaterial = MatInterface->GetBaseMaterial();
			if (BaseMaterial)
			{
				BaseMaterial->SetFlags(RF_Public | RF_Standalone);
			}
		}

		FlushAllPendingAsyncLoading();
	}

	TArray<TSharedPtr<FJsonValue>> BuildLightingMappingTableJson()
	{
		TArray<TSharedPtr<FJsonValue>> Rows;
		for (const FDwebLightMappingRule& Rule : GDwebLightMappingRules)
		{
			TSharedPtr<FJsonObject> Row = MakeShared<FJsonObject>();
			Row->SetStringField(TEXT("threeType"), Rule.ThreeType);
			Row->SetStringField(TEXT("unrealActor"), Rule.UnrealType);
			Row->SetNumberField(TEXT("intensityScale"), Rule.IntensityScale);
			Row->SetNumberField(TEXT("minIntensity"), Rule.MinIntensity);
			Row->SetNumberField(TEXT("maxIntensity"), Rule.MaxIntensity);
			if (Rule.DefaultDistanceCm > 0.0)
			{
				Row->SetNumberField(TEXT("defaultDistanceCm"), Rule.DefaultDistanceCm);
				Row->SetNumberField(TEXT("distanceMinCm"), Rule.MinDistanceCm);
				Row->SetNumberField(TEXT("distanceMaxCm"), Rule.MaxDistanceCm);
			}
			if (Rule.DefaultWidthCm > 0.0)
			{
				Row->SetNumberField(TEXT("defaultWidthCm"), Rule.DefaultWidthCm);
				Row->SetNumberField(TEXT("defaultHeightCm"), Rule.DefaultHeightCm);
			}
			Rows.Add(MakeShared<FJsonValueObject>(Row));
		}
		return Rows;
	}

	bool IsHttpLikeUrl(const FString& InValue)
	{
		const FString Normalized = InValue.TrimStartAndEnd();
		return Normalized.StartsWith(TEXT("http://")) || Normalized.StartsWith(TEXT("https://"));
	}

	bool IsDwebProjectAssetUrl(const FString& InValue)
	{
		const FString Normalized = InValue.TrimStartAndEnd();
		return Normalized.StartsWith(TEXT("dweb://project-assets"));
	}

	bool IsSupportedModelFileExtension(const FString& InPath)
	{
		const FString Normalized = InPath.TrimStartAndEnd().ToLower();
		return Normalized.EndsWith(TEXT(".glb"))
			|| Normalized.EndsWith(TEXT(".gltf"))
			|| Normalized.EndsWith(TEXT(".fbx"))
			|| Normalized.EndsWith(TEXT(".obj"))
			|| Normalized.EndsWith(TEXT(".stl"))
			|| Normalized.EndsWith(TEXT(".dae"));
	}

	FString UrlDecode(const FString& InValue)
	{
		FString Result;
		Result.Reserve(InValue.Len());
		const TCHAR* Ptr = *InValue;
		while (*Ptr)
		{
			if (*Ptr == TCHAR('%') && *(Ptr + 1) && *(Ptr + 2))
			{
				TCHAR Hex[3] = { *(Ptr + 1), *(Ptr + 2), 0 };
				int32 Dec = FParse::HexNumber(Hex);
				if (Dec > 0)
				{
					Result.AppendChar((TCHAR)Dec);
					Ptr += 3;
					continue;
				}
			}
			else if (*Ptr == TCHAR('+'))
			{
				Result.AppendChar(TCHAR(' '));
				++Ptr;
				continue;
			}
			Result.AppendChar(*Ptr);
			++Ptr;
		}
		return Result;
	}

	FString TryFixDvcacheBinPath(const FString& InPath, const FString& ProjectRoot)
	{
		FString Normalized = InPath;
		Normalized.ReplaceInline(TEXT("/"), TEXT("\\"));
		const FString Lower = Normalized.ToLower();

		int32 DvcachePos = Lower.Find(TEXT(".dvcache\\bin\\"));
		if (DvcachePos == INDEX_NONE)
		{
			DvcachePos = Lower.Find(TEXT("dvcache\\bin\\"));
		}
		if (DvcachePos == INDEX_NONE)
		{
			return FString();
		}

		FString FilePart = Normalized.RightChop(DvcachePos);
		int32 SlashPos = FilePart.Find(TEXT("\\"), ESearchCase::IgnoreCase, ESearchDir::FromStart, 1);
		if (SlashPos != INDEX_NONE)
		{
			FilePart = FilePart.Mid(SlashPos + 1);
		}

		FString BaseName = FPaths::GetBaseFilename(FilePart);
		FString MeshyId;

		if (BaseName.StartsWith(TEXT("meshy-3d-")))
		{
			MeshyId = BaseName.Mid(9);
		}
		else if (BaseName.StartsWith(TEXT("meshy_3d_")))
		{
			MeshyId = BaseName.Mid(9);
		}
		else if (BaseName.StartsWith(TEXT("meshy-")))
		{
			MeshyId = BaseName.Mid(6);
		}
		else if (BaseName.StartsWith(TEXT("meshy_")))
		{
			MeshyId = BaseName.Mid(6);
		}

		if (MeshyId.IsEmpty())
		{
			return FString();
		}

		TArray<FString> Candidates;
		Candidates.Add(FString::Printf(TEXT("Content\\Media\\meshy-3d-%s.glb"), *MeshyId));
		Candidates.Add(FString::Printf(TEXT("Content\\Media\\meshy_%s.glb"), *MeshyId));
		Candidates.Add(FString::Printf(TEXT("Content/Media/meshy-3d-%s.glb"), *MeshyId));
		Candidates.Add(FString::Printf(TEXT("Content/Media/meshy_%s.glb"), *MeshyId));

		for (const FString& Rel : Candidates)
		{
			FString TestPath = FPaths::ConvertRelativePathToFull(Rel);
			if (FPaths::FileExists(TestPath) && IsSupportedModelFileExtension(TestPath))
			{
				return TestPath;
			}
			if (!ProjectRoot.IsEmpty())
			{
				FString Combined = FPaths::Combine(ProjectRoot, Rel);
				Combined = FPaths::ConvertRelativePathToFull(Combined);
				if (FPaths::FileExists(Combined) && IsSupportedModelFileExtension(Combined))
				{
					return Combined;
				}
			}
		}

		return FString();
	}

	bool ParseDwebProjectAssetUrl(const FString& InUrl, FString& OutRelativePath)
	{
		OutRelativePath.Reset();
		const FString Normalized = InUrl.TrimStartAndEnd();
		if (!IsDwebProjectAssetUrl(Normalized))
		{
			return false;
		}

		const FString Prefix = TEXT("dweb://project-assets");
		FString UrlToParse = Normalized;

		if (UrlToParse.StartsWith(Prefix))
		{
			int32 PrefixLen = Prefix.Len();
			if (UrlToParse.Len() > PrefixLen && UrlToParse[PrefixLen] == TCHAR('?'))
			{
				UrlToParse.RightChopInline(PrefixLen + 1);
			}
			else
			{
				int32 QueryPos = UrlToParse.Find(TEXT("?"));
				if (QueryPos != INDEX_NONE)
				{
					UrlToParse.RightChopInline(QueryPos + 1);
				}
				else if (UrlToParse.Len() > PrefixLen + 1)
				{
					UrlToParse.RightChopInline(PrefixLen + 1);
				}
				else
				{
					return false;
				}
			}
		}

		TArray<FString> ParamPairs;
		UrlToParse.ParseIntoArray(ParamPairs, TEXT("&"), true);
		for (const FString& Pair : ParamPairs)
		{
			int32 EqPos = Pair.Find(TEXT("="));
			if (EqPos != INDEX_NONE)
			{
				FString Key = Pair.Left(EqPos).TrimStartAndEnd();
				FString Value = Pair.Mid(EqPos + 1).TrimStartAndEnd();
				if (Key.Equals(TEXT("path"), ESearchCase::IgnoreCase))
				{
					OutRelativePath = UrlDecode(Value);
					OutRelativePath.ReplaceInline(TEXT("/"), TEXT("\\"));
					return !OutRelativePath.IsEmpty();
				}
			}
		}

		if (!UrlToParse.IsEmpty() && !UrlToParse.Contains(TEXT("=")))
		{
			OutRelativePath = UrlDecode(UrlToParse);
			OutRelativePath.ReplaceInline(TEXT("/"), TEXT("\\"));
			if (OutRelativePath.StartsWith(TEXT("\\")))
			{
				OutRelativePath.RightChopInline(1);
			}
			const FString Lower = OutRelativePath.ToLower();
			return !OutRelativePath.IsEmpty() && (
				Lower.Contains(TEXT(".glb"))
				|| Lower.Contains(TEXT(".gltf"))
				|| Lower.Contains(TEXT(".fbx"))
				|| Lower.Contains(TEXT(".obj"))
				|| Lower.Contains(TEXT(".stl"))
				|| Lower.Contains(TEXT(".dae"))
			);
		}

		return false;
	}

	bool IsAbsolutePath(const FString& InPath)
	{
		const FString Normalized = InPath.TrimStartAndEnd();
		if (Normalized.IsEmpty()) return false;
		if (Normalized.StartsWith(TEXT("file:///")) || Normalized.StartsWith(TEXT("file://"))) return true;
		if (Normalized.Len() >= 2 && FChar::IsAlpha(Normalized[0]) && Normalized[1] == TCHAR(':')) return true;
		if (Normalized.StartsWith(TEXT("\\")) || Normalized.StartsWith(TEXT("/"))) return true;
		return false;
	}

	FString NormalizeLocalFilePath(const FString& InValue)
	{
		FString Normalized = InValue.TrimStartAndEnd();
		if (Normalized.StartsWith(TEXT("file:///")))
		{
			Normalized.RightChopInline(8);
		}
		else if (Normalized.StartsWith(TEXT("file://")))
		{
			Normalized.RightChopInline(7);
		}
		Normalized.ReplaceInline(TEXT("/"), TEXT("\\"));
		return FPaths::ConvertRelativePathToFull(Normalized);
	}

	bool IsLikelyLocalFilePath(const FString& InValue)
	{
		const FString Normalized = InValue.TrimStartAndEnd();
		if (Normalized.IsEmpty())
		{
			return false;
		}
		if (Normalized.StartsWith(TEXT("file:///")) || Normalized.StartsWith(TEXT("file://")))
		{
			return true;
		}
		return IFileManager::Get().FileExists(*Normalized) || IFileManager::Get().DirectoryExists(*Normalized);
	}

	FString TryInferProjectRootFromAbsolutePath(const FString& AbsoluteFilePath)
	{
		FString Normalized = NormalizeLocalFilePath(AbsoluteFilePath);
		if (Normalized.IsEmpty() || !FPaths::FileExists(Normalized))
		{
			return FString();
		}

		FString CurrentPath = FPaths::GetPath(Normalized);
		while (!CurrentPath.IsEmpty() && CurrentPath.Len() > 3)
		{
			FString ContentFolder = FPaths::Combine(CurrentPath, TEXT("Content"));
			if (IFileManager::Get().DirectoryExists(*ContentFolder))
			{
				return CurrentPath;
			}
			FString ParentPath = FPaths::GetPath(CurrentPath);
			if (ParentPath == CurrentPath)
			{
				break;
			}
			CurrentPath = ParentPath;
		}
		return FString();
	}

	FString TryResolvePathWithProjectRoot(const FString& InPath, const FString& ProjectRoot)
	{
		const FString TrimmedPath = InPath.TrimStartAndEnd();
		const FString TrimmedRoot = ProjectRoot.TrimStartAndEnd();
		if (TrimmedPath.IsEmpty() || TrimmedRoot.IsEmpty())
		{
			return FString();
		}

		FString RelativePart = TrimmedPath;
		while (RelativePart.StartsWith(TEXT("/")) || RelativePart.StartsWith(TEXT("\\")))
		{
			RelativePart.RightChopInline(1);
		}

		FString RootNormalized = TrimmedRoot;
		while (RootNormalized.EndsWith(TEXT("/")) || RootNormalized.EndsWith(TEXT("\\")))
		{
			RootNormalized.LeftChopInline(1);
		}

		FString Combined = FPaths::Combine(RootNormalized, RelativePart);
		Combined = FPaths::ConvertRelativePathToFull(Combined);
		if (FPaths::FileExists(Combined) && IsSupportedModelFileExtension(Combined))
		{
			return Combined;
		}

		return FString();
	}

	double ReadNumberField(const TSharedPtr<FJsonObject>& Object, const TCHAR* FieldName, double DefaultValue = 0.0)
	{
		double Value = DefaultValue;
		if (Object.IsValid())
		{
			Object->TryGetNumberField(FieldName, Value);
		}
		return Value;
	}

	FString ReadStringField(const TSharedPtr<FJsonObject>& Object, const TCHAR* FieldName, const FString& DefaultValue = FString())
	{
		if (!Object.IsValid())
		{
			return DefaultValue;
		}
		FString Value;
		return Object->TryGetStringField(FieldName, Value) ? Value : DefaultValue;
	}

	bool ReadBoolField(const TSharedPtr<FJsonObject>& Object, const TCHAR* FieldName, bool DefaultValue = false)
	{
		bool Value = DefaultValue;
		if (Object.IsValid())
		{
			Object->TryGetBoolField(FieldName, Value);
		}
		return Value;
	}

	TSharedPtr<FJsonObject> ReadObjectField(const TSharedPtr<FJsonObject>& Object, const TCHAR* FieldName)
	{
		const TSharedPtr<FJsonObject>* NestedObject = nullptr;
		if (Object.IsValid() && Object->TryGetObjectField(FieldName, NestedObject) && NestedObject && NestedObject->IsValid())
		{
			return *NestedObject;
		}
		return nullptr;
	}

	FLinearColor ParseColorString(const FString& ColorText, const FLinearColor& DefaultColor = FLinearColor::White)
	{
		const FString Normalized = ColorText.TrimStartAndEnd();
		if (Normalized.IsEmpty())
		{
			return DefaultColor;
		}
		const FColor Parsed = FColor::FromHex(Normalized);
		return Parsed == FColor(0, 0, 0, 0) && !Normalized.Equals(TEXT("#000000")) && !Normalized.Equals(TEXT("000000"))
			? DefaultColor
			: FLinearColor::FromSRGBColor(Parsed);
	}

	FVector ScenePointToUnreal(const TSharedPtr<FJsonObject>& PointObject, double VerticalOffsetInSceneUnits = 0.0)
	{
		const double X = ReadNumberField(PointObject, TEXT("x"), 0.0);
		const double Y = ReadNumberField(PointObject, TEXT("y"), 0.0);
		const double Z = ReadNumberField(PointObject, TEXT("z"), 0.0);
		return FVector(X * 100.0, Z * 100.0, (Y + VerticalOffsetInSceneUnits) * 100.0);
	}

	FRotator SceneQuaternionToUnreal(const TSharedPtr<FJsonObject>& QuaternionObject, const TSharedPtr<FJsonObject>& FallbackRotationObject)
	{
		auto FallbackRotator = [&]() -> FRotator
		{
			const double ScenePitch = ReadNumberField(FallbackRotationObject, TEXT("pitch"), ReadNumberField(FallbackRotationObject, TEXT("x"), 0.0));
			const double SceneYaw = ReadNumberField(FallbackRotationObject, TEXT("yaw"), ReadNumberField(FallbackRotationObject, TEXT("y"), 0.0));
			const double SceneRoll = ReadNumberField(FallbackRotationObject, TEXT("roll"), ReadNumberField(FallbackRotationObject, TEXT("z"), 0.0));
			// Scene (three.js Y-up right-handed) -> Unreal (Z-up left-handed):
			// scene pitch(X) -> unreal roll(X), sign flipped due to handedness flip
			// scene yaw(Y)   -> unreal yaw(Z),  sign flipped due to handedness flip
			// scene roll(Z)  -> unreal pitch(Y), sign flipped due to handedness flip
			return FRotator(
				-SceneRoll,
				-SceneYaw,
				-ScenePitch);
		};

		if (!QuaternionObject.IsValid())
		{
			return FallbackRotator();
		}

		double X = ReadNumberField(QuaternionObject, TEXT("x"), 0.0);
		double Y = ReadNumberField(QuaternionObject, TEXT("y"), 0.0);
		double Z = ReadNumberField(QuaternionObject, TEXT("z"), 0.0);
		double W = ReadNumberField(QuaternionObject, TEXT("w"), 1.0);
		const double Norm = FMath::Sqrt(X * X + Y * Y + Z * Z + W * W);
		if (Norm <= KINDA_SMALL_NUMBER)
		{
			return FallbackRotator();
		}

		X /= Norm;
		Y /= Norm;
		Z /= Norm;
		W /= Norm;

		// Scene (three.js) -> Unreal axis/sign mapping under ScenePointToUnreal axis remap:
		// scene pitch(X) -> unreal roll(X) with negative sign
		// scene yaw(Y)   -> unreal yaw(Z) with negative sign
		// scene roll(Z)  -> unreal pitch(Y) with negative sign
		FQuat UnrealQuat(-X, -Z, -Y, W);
		if (!UnrealQuat.IsNormalized())
		{
			UnrealQuat.Normalize();
		}
		return UnrealQuat.Rotator();
	}

	FRotator SceneRotationToUnreal(const TSharedPtr<FJsonObject>& RotationObject)
	{
		const double ScenePitch = ReadNumberField(RotationObject, TEXT("pitch"), ReadNumberField(RotationObject, TEXT("x"), 0.0));
		const double SceneYaw = ReadNumberField(RotationObject, TEXT("yaw"), ReadNumberField(RotationObject, TEXT("y"), 0.0));
		const double SceneRoll = ReadNumberField(RotationObject, TEXT("roll"), ReadNumberField(RotationObject, TEXT("z"), 0.0));
		// Scene (three.js Y-up right-handed) -> Unreal (Z-up left-handed):
		// scene pitch(X) -> unreal roll(X), sign flipped due to handedness flip
		// scene yaw(Y)   -> unreal yaw(Z),  sign flipped due to handedness flip
		// scene roll(Z)  -> unreal pitch(Y), sign flipped due to handedness flip
		// (Previously SceneRoll had the wrong sign here, which broke Z-axis rotation
		//  in the euler fallback path; quaternion path was already correct.)
		return FRotator(
			-SceneRoll,
			-SceneYaw,
			-ScenePitch);
	}

	FVector SceneScaleToUnreal(const TSharedPtr<FJsonObject>& ScaleObject)
	{
		const double ScaleX = FMath::Max(0.01, ReadNumberField(ScaleObject, TEXT("x"), 1.0));
		const double ScaleY = FMath::Max(0.01, ReadNumberField(ScaleObject, TEXT("y"), 1.0));
		const double ScaleZ = FMath::Max(0.01, ReadNumberField(ScaleObject, TEXT("z"), 1.0));
		return FVector(ScaleX, ScaleZ, ScaleY);
	}

	FVector SceneSizeToUnreal(const TSharedPtr<FJsonObject>& SizeObject)
	{
		const double Width = FMath::Max(0.0, ReadNumberField(SizeObject, TEXT("width"), 0.0));
		const double Height = FMath::Max(0.0, ReadNumberField(SizeObject, TEXT("height"), 0.0));
		const double Depth = FMath::Max(0.0, ReadNumberField(SizeObject, TEXT("depth"), 0.0));
		return FVector(Width * 100.0, Depth * 100.0, Height * 100.0);
	}

	FVector SceneVectorSizeToUnreal(const TSharedPtr<FJsonObject>& SizeObject)
	{
		const double X = FMath::Max(0.0, ReadNumberField(SizeObject, TEXT("x"), 0.0));
		const double Y = FMath::Max(0.0, ReadNumberField(SizeObject, TEXT("y"), 0.0));
		const double Z = FMath::Max(0.0, ReadNumberField(SizeObject, TEXT("z"), 0.0));
		return FVector(X * 100.0, Z * 100.0, Y * 100.0);
	}

	FString BuildSCSMeshListName(const FString& InValue, int32 Index)
	{
		FString Sanitized = InValue;
		for (int32 CharIndex = 0; CharIndex < Sanitized.Len(); ++CharIndex)
		{
			const TCHAR Ch = Sanitized[CharIndex];
			const bool bAlphaNumeric = (Ch >= TEXT('0') && Ch <= TEXT('9'))
				|| (Ch >= TEXT('A') && Ch <= TEXT('Z'))
				|| (Ch >= TEXT('a') && Ch <= TEXT('z'));
			if (!bAlphaNumeric)
			{
				Sanitized[CharIndex] = TEXT('_');
			}
		}
		while (Sanitized.Contains(TEXT("__")))
		{
			Sanitized = Sanitized.Replace(TEXT("__"), TEXT("_"));
		}
		Sanitized.TrimStartAndEndInline();
		while (Sanitized.StartsWith(TEXT("_"))) Sanitized.RightChopInline(1);
		while (Sanitized.EndsWith(TEXT("_"))) Sanitized.LeftChopInline(1);
		if (Sanitized.IsEmpty())
		{
			Sanitized = FString::Printf(TEXT("Slot_%d"), Index + 1);
		}
		return FString::Printf(TEXT("DwebList_%s_%d"), *Sanitized, Index + 1);
	}

	void SyncBlueprintMeshListNodes(UBlueprint* Blueprint, const TArray<FDwebWorkflowLayoutSlot>& LayoutSlots)
	{
		if (!Blueprint)
		{
			return;
		}

		USimpleConstructionScript* const SCS = Blueprint->SimpleConstructionScript;
		if (!SCS)
		{
			return;
		}

		SCS->Modify();

		TArray<USCS_Node*> ExistingNodes = SCS->GetAllNodes();
		for (USCS_Node* Node : ExistingNodes)
		{
			if (!Node)
			{
				continue;
			}

			const FString VariableName = Node->GetVariableName().ToString();
			if (VariableName.StartsWith(TEXT("SM_"), ESearchCase::CaseSensitive) ||
				VariableName.StartsWith(TEXT("DwebMesh_"), ESearchCase::CaseSensitive))
			{
				SCS->RemoveNode(Node);
			}
		}

		USCS_Node* RootNode = SCS->GetDefaultSceneRootNode();
		if (!RootNode)
		{
			UE_LOG(LogTemp, Warning, TEXT("DwebWorkflow SyncBlueprintMeshListNodes: No default scene root node found."));
			return;
		}

		if (USceneComponent* RootComp = Cast<USceneComponent>(RootNode->ComponentTemplate))
		{
			RootComp->SetMobility(EComponentMobility::Movable);
		}

		int32 AddedNodeCount = 0;
		for (int32 SlotIndex = 0; SlotIndex < LayoutSlots.Num(); ++SlotIndex)
		{
			const FDwebWorkflowLayoutSlot& Slot = LayoutSlots[SlotIndex];
			if (!Slot.bEnabled || !Slot.StaticMeshAsset)
			{
				continue;
			}

			const FTransform FinalTransform = Slot.MeshRelativeTransform;

			UE_LOG(LogTemp, Log, TEXT("DwebWorkflow Slot[%d]: %s Mesh=%s Loc=(%.1f,%.1f,%.1f) Rot=(P=%.1f,Y=%.1f,R=%.1f) Scale=(%.2f,%.2f,%.2f)"),
				SlotIndex,
				*Slot.SlotId,
				Slot.StaticMeshAsset ? *Slot.StaticMeshAsset->GetName() : TEXT("None"),
				FinalTransform.GetLocation().X, FinalTransform.GetLocation().Y, FinalTransform.GetLocation().Z,
				FinalTransform.Rotator().Pitch, FinalTransform.Rotator().Yaw, FinalTransform.Rotator().Roll,
				FinalTransform.GetScale3D().X, FinalTransform.GetScale3D().Y, FinalTransform.GetScale3D().Z);

			FString BaseName = Slot.SlotId.TrimStartAndEnd();
			if (BaseName.IsEmpty())
			{
				BaseName = Slot.DisplayName.TrimStartAndEnd();
			}
			if (BaseName.IsEmpty())
			{
				BaseName = FString::Printf(TEXT("Slot_%d"), SlotIndex + 1);
			}
			for (TCHAR& Ch : BaseName)
			{
				if (FChar::IsWhitespace(Ch) || Ch == TEXT('-') || Ch == TEXT('/') || Ch == TEXT('\\') || Ch == TEXT('.') || Ch == TEXT(',') || Ch == TEXT(':') || Ch == TEXT(';'))
				{
					Ch = TEXT('_');
				}
			}
			if (BaseName.Len() > 60)
			{
				BaseName = BaseName.Left(60);
			}

			FName NodeName = SCS->GenerateNewComponentName(UStaticMeshComponent::StaticClass(), FName(*FString::Printf(TEXT("SM_%s"), *BaseName)));

			USCS_Node* NewNode = SCS->CreateNode(UStaticMeshComponent::StaticClass(), NodeName);
			if (!NewNode)
			{
				UE_LOG(LogTemp, Warning, TEXT("DwebWorkflow SyncBlueprintMeshListNodes: Failed to create SCS node for slot %s."), *BaseName);
				continue;
			}

			UStaticMeshComponent* MeshTemplate = Cast<UStaticMeshComponent>(NewNode->ComponentTemplate);
			if (MeshTemplate)
			{
				MeshTemplate->SetMobility(EComponentMobility::Movable);
				MeshTemplate->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
				MeshTemplate->SetGenerateOverlapEvents(true);
				MeshTemplate->SetStaticMesh(Slot.StaticMeshAsset);
				MeshTemplate->SetRelativeLocation(FinalTransform.GetLocation());
				MeshTemplate->SetRelativeRotation(FinalTransform.Rotator());
				MeshTemplate->SetRelativeScale3D(FinalTransform.GetScale3D());

				for (const FDwebWorkflowMaterialOverride& MaterialOverride : Slot.MaterialOverrides)
				{
					if (!MaterialOverride.bEnabled || !MaterialOverride.MaterialInterface)
					{
						continue;
					}
					const int32 MaterialIndex = !MaterialOverride.MaterialSlotName.IsNone()
						? MeshTemplate->GetMaterialIndex(MaterialOverride.MaterialSlotName)
						: 0;
					if (MaterialIndex >= 0)
					{
						MeshTemplate->SetMaterial(MaterialIndex, MaterialOverride.MaterialInterface);
					}
				}
			}

			RootNode->AddChildNode(NewNode);

			if (MeshTemplate)
			{
				MeshTemplate->SetRelativeLocation(FinalTransform.GetLocation());
				MeshTemplate->SetRelativeRotation(FinalTransform.Rotator());
				MeshTemplate->SetRelativeScale3D(FinalTransform.GetScale3D());
			}

			++AddedNodeCount;
		}

		SCS->ValidateSceneRootNodes();

		UE_LOG(LogTemp, Display, TEXT("DwebWorkflow SyncBlueprintMeshListNodes: Added %d SCS mesh nodes to blueprint."), AddedNodeCount);
	}

	TArray<FString> ReadStringArrayField(const TSharedPtr<FJsonObject>& Object, const TCHAR* FieldName)
	{
		TArray<FString> Result;
		const TArray<TSharedPtr<FJsonValue>>* ArrayPtr = nullptr;
		if (!Object.IsValid() || !Object->TryGetArrayField(FieldName, ArrayPtr) || !ArrayPtr)
		{
			return Result;
		}

		for (const TSharedPtr<FJsonValue>& Value : *ArrayPtr)
		{
			const FString Text = Value.IsValid() ? Value->AsString().TrimStartAndEnd() : FString();
			if (!Text.IsEmpty())
			{
				Result.Add(Text);
			}
		}
		return Result;
	}

	enum class EDwebFillAxis : uint8
	{
		None,
		X,
		Y,
		Z,
	};

	EDwebFillAxis ResolveFillAxis(const FString& FillMode)
	{
		const FString Normalized = FillMode.TrimStartAndEnd().ToLower();
		if (Normalized == TEXT("fill-x"))
		{
			return EDwebFillAxis::X;
		}
		if (Normalized == TEXT("fill-y"))
		{
			return EDwebFillAxis::Y;
		}
		if (Normalized == TEXT("fill-z"))
		{
			return EDwebFillAxis::Z;
		}
		return EDwebFillAxis::None;
	}

	int32 FillAxisToUnrealComponentIndex(const EDwebFillAxis Axis)
	{
		switch (Axis)
		{
		case EDwebFillAxis::X:
			return 0;
		case EDwebFillAxis::Y:
			return 2;
		case EDwebFillAxis::Z:
			return 1;
		default:
			return INDEX_NONE;
		}
	}

	double GetVectorComponent(const FVector& Vector, const int32 ComponentIndex)
	{
		switch (ComponentIndex)
		{
		case 0:
			return Vector.X;
		case 1:
			return Vector.Y;
		case 2:
			return Vector.Z;
		default:
			return 0.0;
		}
	}

	void SetVectorComponent(FVector& Vector, const int32 ComponentIndex, const double Value)
	{
		switch (ComponentIndex)
		{
		case 0:
			Vector.X = Value;
			break;
		case 1:
			Vector.Y = Value;
			break;
		case 2:
			Vector.Z = Value;
			break;
		default:
			break;
		}
	}

	FVector GetStaticMeshBoundsSize(UStaticMesh* StaticMesh)
	{
		if (!StaticMesh)
		{
			return FVector(100.0f, 100.0f, 100.0f);
		}

		const FVector BoxExtent = StaticMesh->GetBounds().BoxExtent;
		return FVector(
			FMath::Max(BoxExtent.X * 2.0f, 1.0f),
			FMath::Max(BoxExtent.Y * 2.0f, 1.0f),
			FMath::Max(BoxExtent.Z * 2.0f, 1.0f));
	}

	FVector ComputeRotatedBoundsSize(const FVector& LocalSize, const FRotator& Rotation, const FVector& Scale3D)
	{
		const FVector Extent(
			FMath::Max(0.5f, LocalSize.X * 0.5f * FMath::Abs(Scale3D.X)),
			FMath::Max(0.5f, LocalSize.Y * 0.5f * FMath::Abs(Scale3D.Y)),
			FMath::Max(0.5f, LocalSize.Z * 0.5f * FMath::Abs(Scale3D.Z)));

		const FMatrix RotationMatrix = FRotationMatrix(Rotation);
		FVector RotatedExtent = FVector::ZeroVector;
		for (int32 Row = 0; Row < 3; ++Row)
		{
			const double M0 = FMath::Abs(RotationMatrix.M[Row][0]);
			const double M1 = FMath::Abs(RotationMatrix.M[Row][1]);
			const double M2 = FMath::Abs(RotationMatrix.M[Row][2]);
			SetVectorComponent(RotatedExtent, Row, M0 * Extent.X + M1 * Extent.Y + M2 * Extent.Z);
		}

		return RotatedExtent * 2.0f;
	}

	FVector ComputePreviewAlignedScale(UStaticMesh* StaticMesh, const FVector& PlaceholderSize, const FVector& BaseScale, const FRotator& CombinedRotation, const FString& PreviewScaleMode, const FString& FitMode, const FString& FillMode, const float FillAxisScale, const int32 FillCount)
	{
		const FVector MeshBoundsSize = GetStaticMeshBoundsSize(StaticMesh);
		const FVector RotatedSize = ComputeRotatedBoundsSize(MeshBoundsSize, CombinedRotation, BaseScale);
		const FVector SafePlaceholderSize(
			FMath::Max(PlaceholderSize.X, 1.0f),
			FMath::Max(PlaceholderSize.Y, 1.0f),
			FMath::Max(PlaceholderSize.Z, 1.0f));
		const FVector Ratios(
			SafePlaceholderSize.X / FMath::Max(RotatedSize.X, 1.0f),
			SafePlaceholderSize.Y / FMath::Max(RotatedSize.Y, 1.0f),
			SafePlaceholderSize.Z / FMath::Max(RotatedSize.Z, 1.0f));

		const bool bForced = FitMode.Equals(TEXT("forced"), ESearchCase::IgnoreCase);
		const bool bUseModelScale = !bForced && PreviewScaleMode.Equals(TEXT("model"), ESearchCase::IgnoreCase);
		const EDwebFillAxis FillAxis = ResolveFillAxis(FillMode);
		const int32 FillAxisComponentIndex = FillAxisToUnrealComponentIndex(FillAxis);
		FVector Correction = Ratios;

		if (bForced)
		{
			Correction = Ratios;
		}
		else if (FillAxis != EDwebFillAxis::None && FillCount > 1)
		{
			FVector TargetSize = SafePlaceholderSize;
			const double CellExtent = GetVectorComponent(SafePlaceholderSize, FillAxisComponentIndex) / FMath::Max(FillCount, 1);
			SetVectorComponent(TargetSize, FillAxisComponentIndex, CellExtent);
			Correction = FVector(
				TargetSize.X / FMath::Max(RotatedSize.X, 1.0f),
				TargetSize.Y / FMath::Max(RotatedSize.Y, 1.0f),
				TargetSize.Z / FMath::Max(RotatedSize.Z, 1.0f));
		}
		else if (FillAxis != EDwebFillAxis::None)
		{
			Correction = Ratios;
			SetVectorComponent(Correction, FillAxisComponentIndex, FMath::Max(static_cast<double>(FillAxisScale), 0.0001));
		}
		else if (bUseModelScale)
		{
			const double Uniform = FMath::Max(0.0001, FMath::Min3(Ratios.X, Ratios.Y, Ratios.Z));
			Correction = FVector(Uniform, Uniform, Uniform);
		}

		return FVector(
			FMath::Max(BaseScale.X * Correction.X, 0.0001f),
			FMath::Max(BaseScale.Y * Correction.Y, 0.0001f),
			FMath::Max(BaseScale.Z * Correction.Z, 0.0001f));
	}

	FVector ComputeFillCloneOffset(const FVector& PlaceholderSize, const FString& FillMode, const int32 FillCount, const int32 FillIndex)
	{
		const EDwebFillAxis FillAxis = ResolveFillAxis(FillMode);
		const int32 FillAxisComponentIndex = FillAxisToUnrealComponentIndex(FillAxis);
		if (FillAxis == EDwebFillAxis::None || FillAxisComponentIndex == INDEX_NONE || FillCount <= 1)
		{
			return FVector::ZeroVector;
		}

		const double TotalExtent = GetVectorComponent(PlaceholderSize, FillAxisComponentIndex);
		const double CellExtent = TotalExtent / FMath::Max(FillCount, 1);
		const double MinOffset = (-TotalExtent * 0.5) + (CellExtent * 0.5);
		FVector Offset = FVector::ZeroVector;
		SetVectorComponent(Offset, FillAxisComponentIndex, MinOffset + CellExtent * FillIndex);
		return Offset;
	}
}

const FName FDwebWorkflowBridgeModule::BridgeTabName(TEXT("DwebWorkflowBridge"));

void FDwebWorkflowBridgeModule::StartupModule()
{
	BackendUrl = TEXT("http://127.0.0.1:5860");
	AssetRootPath = TEXT("/Game/DVStudio");
	ConnectionStatus = TEXT("Waiting for DVStudio...");
	CurrentStageText = TEXT("Waiting for connection");
	CurrentProgressPercent = 0.0f;
	LatestLog = TEXT("Plugin started. Auto-discovering DVStudio backend...");

	LoadConnectionConfig();

	FGlobalTabmanager::Get()->RegisterNomadTabSpawner(BridgeTabName, FOnSpawnTab::CreateRaw(this, &FDwebWorkflowBridgeModule::OnSpawnPluginTab))
		.SetDisplayName(LOCTEXT("BridgeTabTitle", "Dweb Workflow Bridge"))
		.SetMenuType(ETabSpawnerMenuType::Hidden);

	UToolMenus::RegisterStartupCallback(FSimpleMulticastDelegate::FDelegate::CreateRaw(this, &FDwebWorkflowBridgeModule::RegisterMenus));

	OpenTabConsoleCommand = MakeUnique<FAutoConsoleCommand>(
		TEXT("DwebWorkflow.OpenTab"),
		TEXT("Open the Dweb Workflow Bridge tab."),
		FConsoleCommandDelegate::CreateRaw(this, &FDwebWorkflowBridgeModule::OpenPluginWindow)
	);

	ApplyLayoutComponentsCommand = MakeUnique<FAutoConsoleCommand>(
		TEXT("DwebWorkflow.ApplyLayoutComponents"),
		TEXT("Apply layout slots as static mesh components to selected DwebWorkflowLayoutActorBase actors."),
		FConsoleCommandDelegate::CreateRaw(this, &FDwebWorkflowBridgeModule::ApplyLayoutComponentsToSelectedActors)
	);

	HeartbeatTickerHandle = FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateRaw(this, &FDwebWorkflowBridgeModule::HandleHeartbeatTick), 3.0f);
}

void FDwebWorkflowBridgeModule::ShutdownModule()
{
	if (HeartbeatTickerHandle.IsValid())
	{
		FTSTicker::GetCoreTicker().RemoveTicker(HeartbeatTickerHandle);
		HeartbeatTickerHandle.Reset();
	}

	OpenTabConsoleCommand.Reset();
	ApplyLayoutComponentsCommand.Reset();
	UToolMenus::UnRegisterStartupCallback(this);
	UToolMenus::UnregisterOwner(this);
	FGlobalTabmanager::Get()->UnregisterNomadTabSpawner(BridgeTabName);
}

void FDwebWorkflowBridgeModule::RegisterMenus()
{
	FToolMenuOwnerScoped OwnerScoped(this);
	UToolMenu* WindowMenu = UToolMenus::Get()->ExtendMenu("LevelEditor.MainMenu.Window");
	FToolMenuSection& Section = WindowMenu->AddSection("DwebWorkflowBridgeSection", LOCTEXT("DwebSection", "Dweb"));
	Section.AddMenuEntry(
		"OpenDwebWorkflowBridge",
		LOCTEXT("OpenBridgeLabel", "Dweb Workflow Bridge"),
		LOCTEXT("OpenBridgeTooltip", "Open the Dweb workflow bridge panel."),
		FSlateIcon(),
		FUIAction(FExecuteAction::CreateRaw(this, &FDwebWorkflowBridgeModule::OpenPluginWindow))
	);
}

void FDwebWorkflowBridgeModule::OpenPluginWindow()
{
	FGlobalTabmanager::Get()->TryInvokeTab(BridgeTabName);
}

TSharedRef<SDockTab> FDwebWorkflowBridgeModule::OnSpawnPluginTab(const FSpawnTabArgs& SpawnTabArgs)
{
	RefreshSceneActorOptions();
	return SNew(SDockTab)
		.TabRole(ETabRole::NomadTab)
		[
			SNew(SBorder)
			.Padding(14.0f)
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 10)
				[
					SNew(STextBlock)
					.Text(LOCTEXT("PanelTitle", "Dweb Workflow Bridge"))
					.Font(FCoreStyle::GetDefaultFontStyle("Bold", 14))
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 8)
				[
					SNew(STextBlock)
					.Text_Lambda([this]()
					{
						return FText::FromString(FString::Printf(TEXT("Status: %s"), *ConnectionStatus));
					})
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 10)
				[
					SNew(SHorizontalBox)
					+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 8, 0)
					[
						SNew(SButton)
						.Text_Lambda([this]()
						{
							return SessionId.IsEmpty()
								? LOCTEXT("ConnectButton", "Connect to DVStudio")
								: LOCTEXT("DisconnectButton", "Disconnect");
						})
						.OnClicked_Raw(this, &FDwebWorkflowBridgeModule::OnConnectOrDisconnectClicked)
					]
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 4)
				[
					SNew(STextBlock).Text(LOCTEXT("ProgressLabel", "Task Progress"))
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 6)
				[
					SNew(STextBlock)
					.Text_Lambda([this]()
					{
						return FText::FromString(FString::Printf(TEXT("%s · %.0f%%"), *CurrentStageText, CurrentProgressPercent));
					})
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 10)
				[
					SNew(SProgressBar)
					.Percent_Lambda([this]() { return CurrentProgressPercent <= 0.0f ? 0.0f : CurrentProgressPercent / 100.0f; })
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 10, 0, 6)
				[
					SNew(SSeparator)
				]
				+ SVerticalBox::Slot().FillHeight(1.0f)
				[
					SNew(SScrollBox)
					+ SScrollBox::Slot()
					[
						SNew(STextBlock)
						.AutoWrapText(true)
						.Text_Lambda([this]() { return FText::FromString(LatestLog); })
					]
				]
			]
		];
}

FReply FDwebWorkflowBridgeModule::OnConnectOrDisconnectClicked()
{
	if (!SessionId.IsEmpty())
	{
		DisconnectSession();
		return FReply::Handled();
	}
	RegisterSession();
	return FReply::Handled();
}

void FDwebWorkflowBridgeModule::DisconnectSession()
{
	if (SessionId.IsEmpty())
	{
		return;
	}
	SessionId.Empty();
	bConnected = false;
	bIsProcessingJob = false;
	bPollInFlight = false;
	bHeartbeatInFlight = false;
	CurrentJobId.Empty();
	CurrentProgressPercent = 0.0f;
	CurrentStageText = TEXT("Waiting for task");
	UpdateConnectionStatus(TEXT("Disconnected"));
	AppendLog(TEXT("Disconnected from DVStudio."));
}

void FDwebWorkflowBridgeModule::RegisterSession()
{
	UpdateConnectionStatus(TEXT("Connecting to workflow..."));
	const FString Url = BuildApiUrl(TEXT("/api/agent-skills/unreal/register"));
	TSharedRef<FJsonObject> Root = MakeShared<FJsonObject>();
	Root->SetStringField(TEXT("projectId"), FApp::GetProjectName());
	
	TSharedRef<FJsonObject> ClientInfo = MakeShared<FJsonObject>();
	ClientInfo->SetStringField(TEXT("displayName"), FString::Printf(TEXT("%s Editor"), FApp::GetProjectName()));
	ClientInfo->SetStringField(TEXT("projectName"), FApp::GetProjectName());
	ClientInfo->SetStringField(TEXT("projectPath"), FPaths::ConvertRelativePathToFull(FPaths::ProjectDir()));
	ClientInfo->SetStringField(TEXT("assetRootPath"), AssetRootPath);
	ClientInfo->SetStringField(TEXT("pluginVersion"), TEXT("0.3.0"));
	ClientInfo->SetStringField(TEXT("engineVersion"), FEngineVersion::Current().ToString());
	ClientInfo->SetStringField(TEXT("hostName"), FPlatformProcess::ComputerName());
	Root->SetObjectField(TEXT("clientInfo"), ClientInfo);

	FString Body;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
	FJsonSerializer::Serialize(Root, Writer);

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(Url);
	Request->SetVerb(TEXT("POST"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Request->SetContentAsString(Body);
	Request->OnProcessRequestComplete().BindLambda([this](FHttpRequestPtr, FHttpResponsePtr Response, bool bWasSuccessful)
	{
		if (!bWasSuccessful || !Response.IsValid())
		{
			UpdateConnectionStatus(TEXT("Connection failed"));
			AppendLog(TEXT("Connection failed: backend not responding."));
			return;
		}

		TSharedPtr<FJsonObject> RootObject;
		if (!ParseJson(Response->GetContentAsString(), RootObject) || !RootObject.IsValid())
		{
			UpdateConnectionStatus(TEXT("Connection failed"));
			AppendLog(TEXT("Connection failed: JSON parse error."));
			return;
		}

		bool bOk = false;
		RootObject->TryGetBoolField(TEXT("ok"), bOk);
		if (!bOk)
		{
			UpdateConnectionStatus(TEXT("Connection failed"));
			const FString ErrorMsg = ReadStringField(RootObject, TEXT("error"), TEXT("Unknown error"));
			AppendLog(FString::Printf(TEXT("Connection failed: %s"), *ErrorMsg));
			return;
		}

		const FString PreviousSessionId = SessionId;
		SessionId = ReadStringField(RootObject, TEXT("sessionId"));
		FString ProjectId = ReadStringField(RootObject, TEXT("projectId"));
		const TSharedPtr<FJsonObject>* SessionObject = nullptr;
		if (RootObject->TryGetObjectField(TEXT("session"), SessionObject) && SessionObject && SessionObject->IsValid())
		{
			if (SessionId.IsEmpty())
			{
				SessionId = ReadStringField(*SessionObject, TEXT("id"));
			}
			if (ProjectId.IsEmpty())
			{
				ProjectId = ReadStringField(*SessionObject, TEXT("projectId"));
			}
		}
		if (ProjectId.IsEmpty())
		{
			ProjectId = FString(FApp::GetProjectName());
		}
		const bool bReused = ReadBoolField(RootObject, TEXT("reused"));
		bConnected = true;
		UpdateConnectionStatus(FString::Printf(TEXT("Connected %s"), ProjectId.IsEmpty() ? *SessionId : *ProjectId));
		AppendLog(FString::Printf(TEXT("Connected successfully. SessionId=%s%s"), *SessionId, bReused ? TEXT(" (session reused)") : (PreviousSessionId.IsEmpty() || PreviousSessionId == SessionId ? TEXT("") : TEXT(" (session switched)"))));
		if (!bIsProcessingJob && !bPollInFlight)
		{
			PollNextJob(true);
		}
	});
	Request->ProcessRequest();
}

void FDwebWorkflowBridgeModule::SendHeartbeat()
{
	if (SessionId.IsEmpty() || bHeartbeatInFlight)
	{
		return;
	}
	bHeartbeatInFlight = true;
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(BuildApiUrl(TEXT("/api/agent-skills/unreal/heartbeat")));
	Request->SetVerb(TEXT("POST"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	
	TSharedRef<FJsonObject> ClientInfo = MakeShared<FJsonObject>();
	ClientInfo->SetStringField(TEXT("projectName"), FApp::GetProjectName());
	ClientInfo->SetStringField(TEXT("projectPath"), FPaths::ConvertRelativePathToFull(FPaths::ProjectDir()));

	TSharedRef<FJsonObject> Root = MakeShared<FJsonObject>();
	Root->SetStringField(TEXT("sessionId"), SessionId);
	Root->SetObjectField(TEXT("clientInfo"), ClientInfo);
	FString Body;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
	FJsonSerializer::Serialize(Root, Writer);
	Request->SetContentAsString(Body);
	
	Request->OnProcessRequestComplete().BindLambda([this](FHttpRequestPtr Req, FHttpResponsePtr Response, bool bWasSuccessful)
	{
		bHeartbeatInFlight = false;
		if (!bWasSuccessful || !Response.IsValid())
		{
			bConnected = false;
			UpdateConnectionStatus(TEXT("Disconnected"));
			AppendLog(TEXT("Heartbeat failed: backend not responding."));
			return;
		}

		TSharedPtr<FJsonObject> RootObj;
		if (!ParseJson(Response->GetContentAsString(), RootObj) || !RootObj.IsValid())
		{
			bConnected = false;
			UpdateConnectionStatus(TEXT("Disconnected"));
			AppendLog(TEXT("Heartbeat failed: invalid response."));
			return;
		}

		bool bOk = false;
		RootObj->TryGetBoolField(TEXT("ok"), bOk);
		if (!bOk)
		{
			int32 StatusCode = Response->GetResponseCode();
			if (StatusCode == 404)
			{
				bConnected = false;
				AppendLog(TEXT("Session expired. Reconnecting..."));
				SessionId.Empty();
				UpdateConnectionStatus(TEXT("Disconnected"));
				RegisterSession();
				return;
			}
			bConnected = false;
			UpdateConnectionStatus(TEXT("Disconnected"));
			AppendLog(TEXT("Heartbeat failed."));
			return;
		}

		bConnected = true;
		UpdateConnectionStatus(FString::Printf(TEXT("Connected %s"), FApp::GetProjectName()));
		if (!bIsProcessingJob && !bPollInFlight)
		{
			PollNextJob(true);
		}
	});
	Request->ProcessRequest();
}

void FDwebWorkflowBridgeModule::UpdateJobStatus(const FString& JobId, const FString& Status, const FString& Message, const TSharedPtr<FJsonObject>& ResultData)
{
	if (JobId.IsEmpty())
	{
		return;
	}

	TSharedRef<FJsonObject> Root = MakeShared<FJsonObject>();
	Root->SetStringField(TEXT("status"), Status);
	Root->SetStringField(TEXT("message"), Message);
	CurrentStageText = Message.IsEmpty() ? Status : Message;
	if (ResultData.IsValid())
	{
		const TSharedPtr<FJsonObject> ProgressData = ResultData;
		double ProgressValue = CurrentProgressPercent;
		if (ProgressData->TryGetNumberField(TEXT("progress"), ProgressValue))
		{
			CurrentProgressPercent = FMath::Clamp(static_cast<float>(ProgressValue), 0.0f, 100.0f);
		}
		FString StageText;
		if (ProgressData->TryGetStringField(TEXT("stage"), StageText) && !StageText.IsEmpty())
		{
			CurrentStageText = StageText;
		}
	}
	if (ResultData.IsValid())
	{
		Root->SetObjectField(TEXT("resultData"), ResultData);
	}

	FString Body;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
	FJsonSerializer::Serialize(Root, Writer);

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(BuildApiUrl(FString::Printf(TEXT("/api/agent-skills/unreal/jobs/%s/update"), *JobId)));
	Request->SetVerb(TEXT("POST"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Request->SetContentAsString(Body);
	Request->OnProcessRequestComplete().BindLambda([this, JobId, Status](FHttpRequestPtr, FHttpResponsePtr Response, bool bWasSuccessful)
	{
		if (!bWasSuccessful || !Response.IsValid())
		{
			AppendLog(FString::Printf(TEXT("Failed to update job status: %s -> %s"), *JobId, *Status));
		}
	});
	Request->ProcessRequest();
}

void FDwebWorkflowBridgeModule::PollNextJob(bool bSilentIfEmpty)
{
	if (SessionId.IsEmpty())
	{
		if (!bSilentIfEmpty)
		{
			AppendLog(TEXT("No valid session. Please click 'Connect Workflow' first."));
		}
		return;
	}

	if (bPollInFlight || bIsProcessingJob)
	{
		return;
	}

	bPollInFlight = true;
	TSharedRef<FJsonObject> Root = MakeShared<FJsonObject>();
	Root->SetStringField(TEXT("sessionId"), SessionId);
	FString Body;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
	FJsonSerializer::Serialize(Root, Writer);

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(BuildApiUrl(TEXT("/api/agent-skills/unreal/pick-job")));
	Request->SetVerb(TEXT("POST"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Request->SetContentAsString(Body);
	Request->OnProcessRequestComplete().BindLambda([this, bSilentIfEmpty](FHttpRequestPtr, FHttpResponsePtr Response, bool bWasSuccessful)
	{
		bPollInFlight = false;
		if (!bWasSuccessful || !Response.IsValid())
		{
			if (!bSilentIfEmpty)
			{
				AppendLog(TEXT("Failed to check tasks: backend not responding."));
			}
			return;
		}

		TSharedPtr<FJsonObject> RootObject;
		if (!ParseJson(Response->GetContentAsString(), RootObject) || !RootObject.IsValid())
		{
			if (!bSilentIfEmpty)
			{
				AppendLog(TEXT("Failed to check tasks: JSON parse error."));
			}
			return;
		}

		bool bOk = false;
		RootObject->TryGetBoolField(TEXT("ok"), bOk);
		if (!bOk)
		{
			if (!bSilentIfEmpty)
			{
				const FString ErrorMsg = ReadStringField(RootObject, TEXT("error"), TEXT("Unknown error"));
				AppendLog(FString::Printf(TEXT("Failed to check tasks: %s"), *ErrorMsg));
			}
			return;
		}

		const TSharedPtr<FJsonObject>* JobObject = nullptr;
		if (!RootObject->TryGetObjectField(TEXT("job"), JobObject) || !JobObject || !JobObject->IsValid())
		{
			if (!bSilentIfEmpty)
			{
				AppendLog(TEXT("No pending export tasks."));
			}
			return;
		}

		bIsProcessingJob = true;
		CurrentJobId = ReadStringField(*JobObject, TEXT("jobId"));
		const FString SceneName = ReadStringField(*JobObject, TEXT("sceneName"), TEXT("DwebSceneExport"));
		const FString JobAssetRootPath = ReadStringField(*JobObject, TEXT("assetRootPath"));
		if (!JobAssetRootPath.IsEmpty())
		{
			AssetRootPath = JobAssetRootPath;
		}
		const FString JobType = ReadStringField(*JobObject, TEXT("type"), TEXT("export"));
		AppendLog(FString::Printf(TEXT("Received export job %s, scene: %s. Starting execution..."), *CurrentJobId, *SceneName));
		UpdateConnectionStatus(FString::Printf(TEXT("Executing job %s"), *CurrentJobId));
		CurrentStageText = TEXT("Preparing asset import");
		CurrentProgressPercent = 10.0f;
		{
			TSharedPtr<FJsonObject> InitialProgress = MakeShared<FJsonObject>();
			InitialProgress->SetStringField(TEXT("stage"), TEXT("Preparing asset import"));
			InitialProgress->SetNumberField(TEXT("progress"), 10.0);
			UpdateJobStatus(CurrentJobId, TEXT("importing"), TEXT("Unreal plugin preparing asset export"), InitialProgress);
		}

		FString ResultMessage;
		TSharedPtr<FJsonObject> ResultData;
		bool bJobSuccess = false;
		const TSharedPtr<FJsonObject>* ExportPayloadPtr = nullptr;
		const bool bHasPayload = (*JobObject)->TryGetObjectField(TEXT("exportPayload"), ExportPayloadPtr) && ExportPayloadPtr && ExportPayloadPtr->IsValid();
		const FString PayloadExportMode = bHasPayload ? ReadStringField(*ExportPayloadPtr, TEXT("exportMode"), TEXT("scene-layout")).TrimStartAndEnd() : TEXT("scene-layout");
		if (JobType.Equals(TEXT("lighting"), ESearchCase::IgnoreCase) || PayloadExportMode.Equals(TEXT("lighting-only"), ESearchCase::IgnoreCase))
		{
			if (bHasPayload)
			{
				bJobSuccess = ExecuteLightingOnlyJob(CurrentJobId, SceneName, *ExportPayloadPtr, ResultMessage, ResultData);
			}
			else
			{
				ResultMessage = TEXT("Execution failed: missing exportPayload.");
			}
		}
		else
		{
			bJobSuccess = ExecuteExportJob(*JobObject, ResultMessage, ResultData);
		}

		bIsProcessingJob = false;
		if (bJobSuccess)
		{
			UpdateJobStatus(CurrentJobId, TEXT("completed"), ResultMessage, ResultData);
			UpdateConnectionStatus(FString::Printf(TEXT("Connected %s"), FApp::GetProjectName()));
			AppendLog(ResultMessage);
		}
		else
		{
			const FString ErrorMessage = ResultMessage.IsEmpty() ? TEXT("Export job execution failed.") : ResultMessage;
			UpdateJobStatus(CurrentJobId, TEXT("failed"), ErrorMessage, ResultData);
			UpdateConnectionStatus(FString::Printf(TEXT("Connected %s"), FApp::GetProjectName()));
			AppendLog(ErrorMessage);
		}
		CurrentJobId.Empty();
		CurrentProgressPercent = 0.0f;
		CurrentStageText = TEXT("Waiting for task");
	});
	Request->ProcessRequest();
}

bool FDwebWorkflowBridgeModule::ExecuteExportJob(const TSharedPtr<FJsonObject>& JobObject, FString& OutMessage, TSharedPtr<FJsonObject>& OutResultData)
{
	OutResultData = MakeShared<FJsonObject>();
	if (!JobObject.IsValid())
	{
		OutMessage = TEXT("Execution failed: job object is null.");
		return false;
	}

	const FString JobId = ReadStringField(JobObject, TEXT("jobId"));
	const FString SceneName = SanitizeIdentifier(ReadStringField(JobObject, TEXT("sceneName"), TEXT("DwebSceneExport")), TEXT("Scene"));
	const TSharedPtr<FJsonObject>* ExportPayloadPtr = nullptr;
	if (!JobObject->TryGetObjectField(TEXT("exportPayload"), ExportPayloadPtr) || !ExportPayloadPtr || !ExportPayloadPtr->IsValid())
	{
		OutMessage = TEXT("Execution failed: missing exportPayload.") ;
		return false;
	}

	const TSharedPtr<FJsonObject> ExportPayload = *ExportPayloadPtr;
	const FString ExportMode = ReadStringField(ExportPayload, TEXT("exportMode"), TEXT("scene-layout")).TrimStartAndEnd();
	const int32 LayoutProtocolVersion = FMath::Max(1, static_cast<int32>(ReadNumberField(ExportPayload, TEXT("layoutProtocolVersion"), 1.0)));
	FString ManifestPath;
	FString DirectoryError;
	if (!SaveJobManifest(JobId, ExportPayload, ManifestPath, DirectoryError))
	{
		OutMessage = FString::Printf(TEXT("Execution failed: cannot write export manifest. %s"), *DirectoryError);
		return false;
	}
	OutResultData->SetStringField(TEXT("manifestPath"), ManifestPath);
	OutResultData->SetStringField(TEXT("assetRootPath"), AssetRootPath);
	OutResultData->SetStringField(TEXT("exportMode"), ExportMode.IsEmpty() ? TEXT("scene-layout") : ExportMode);
	OutResultData->SetNumberField(TEXT("layoutProtocolVersion"), LayoutProtocolVersion);

	if (ExportMode.Equals(TEXT("lighting-only"), ESearchCase::IgnoreCase))
	{
		return ExecuteLightingOnlyJob(JobId, SceneName, ExportPayload, OutMessage, OutResultData);
	}

	const TArray<TSharedPtr<FJsonValue>>* LayoutItemsPtr = nullptr;
	const TArray<TSharedPtr<FJsonValue>>* ResolvedLayoutSlotsPtr = nullptr;
	const TArray<TSharedPtr<FJsonValue>>* ModelBindingsPtr = nullptr;
	ExportPayload->TryGetArrayField(TEXT("layoutItems"), LayoutItemsPtr);
	ExportPayload->TryGetArrayField(TEXT("resolvedLayoutSlots"), ResolvedLayoutSlotsPtr);
	ExportPayload->TryGetArrayField(TEXT("modelBindings"), ModelBindingsPtr);
	const FString SceneContentPath = BuildSceneContentPath(SceneName);
	const FString ModelsAssetPath = SceneContentPath / TEXT("models");
	const FString BlueprintAssetName = FString::Printf(TEXT("%s_Actor"), *SceneName);
	OutResultData->SetStringField(TEXT("stage"), TEXT("Analyzing export job"));
	OutResultData->SetNumberField(TEXT("progress"), 25.0);
	OutResultData->SetStringField(TEXT("modelsAssetPath"), ModelsAssetPath);
	UpdateJobStatus(JobId, TEXT("importing"), TEXT("Analyzing layout and model bindings"), OutResultData);

	int32 PendingModelCount = 0;
	for (const TSharedPtr<FJsonValue>& BindingValue : (ModelBindingsPtr ? *ModelBindingsPtr : TArray<TSharedPtr<FJsonValue>>()))
	{
		const TSharedPtr<FJsonObject> BindingObject = BindingValue.IsValid() ? BindingValue->AsObject() : nullptr;
		if (!BindingObject.IsValid())
		{
			continue;
		}
		const FString ModelUrl = ReadStringField(BindingObject, TEXT("modelUrl")).TrimStartAndEnd();
		const FString ModelAssetUrl = ReadStringField(BindingObject, TEXT("modelAssetUrl")).TrimStartAndEnd();
		if (!ModelUrl.IsEmpty() || !ModelAssetUrl.IsEmpty())
		{
			++PendingModelCount;
		}
	}
	OutResultData->SetNumberField(TEXT("pendingModelImportCount"), PendingModelCount);
	if (PendingModelCount <= 0)
	{
		OutMessage = TEXT("Execution failed: no real model bindings to import. Stopped placeholder export.");
		return false;
	}

	TSharedPtr<FJsonObject> AssetPlan = MakeShared<FJsonObject>();
	AssetPlan->SetStringField(TEXT("sceneName"), SceneName);
	AssetPlan->SetStringField(TEXT("sceneContentPath"), SceneContentPath);
	AssetPlan->SetStringField(TEXT("modelsAssetPath"), ModelsAssetPath);
	AssetPlan->SetStringField(TEXT("blueprintAssetName"), BlueprintAssetName);
	AssetPlan->SetNumberField(TEXT("pendingModelImportCount"), PendingModelCount);
	if (ResolvedLayoutSlotsPtr)
	{
		AssetPlan->SetArrayField(TEXT("resolvedLayoutSlots"), *ResolvedLayoutSlotsPtr);
	}
	if (LayoutItemsPtr)
	{
		AssetPlan->SetArrayField(TEXT("layoutItems"), *LayoutItemsPtr);
	}
	if (ModelBindingsPtr)
	{
		AssetPlan->SetArrayField(TEXT("modelBindings"), *ModelBindingsPtr);
	}
	FString AssetPlanError;
	const FString AssetPlanPath = FPaths::Combine(FPaths::GetPath(ManifestPath), TEXT("scene_asset_plan.json"));
	if (!SaveJsonFile(AssetPlanPath, AssetPlan, AssetPlanError))
	{
		OutMessage = FString::Printf(TEXT("Execution failed: cannot write asset import plan. %s"), *AssetPlanError);
		return false;
	}
	OutResultData->SetStringField(TEXT("assetPlanPath"), AssetPlanPath);

	TArray<TSharedPtr<FJsonValue>> ImportedAssets;
	int32 ImportedAssetCount = 0;
	int32 PendingDownloadCount = 0;
	FString ImportError;
	if (!ImportReferencedModelAssets(JobId, ExportPayload, ModelsAssetPath, ImportedAssets, ImportedAssetCount, PendingDownloadCount, ImportError))
	{
		OutMessage = FString::Printf(TEXT("Execution failed: model import failed. %s"), *ImportError);
		return false;
	}
	OutResultData->SetArrayField(TEXT("importedAssets"), ImportedAssets);
	OutResultData->SetNumberField(TEXT("importedAssetCount"), ImportedAssetCount);
	OutResultData->SetNumberField(TEXT("pendingModelImportCount"), PendingModelCount);
	OutResultData->SetNumberField(TEXT("pendingDownloadCount"), PendingDownloadCount);

	TSharedPtr<FJsonObject> AssembleProgress = MakeShared<FJsonObject>();
	AssembleProgress->SetStringField(TEXT("stage"), TEXT("Generating Actor asset shell"));
	AssembleProgress->SetNumberField(TEXT("progress"), ImportedAssetCount > 0 ? 78.0 : 68.0);
	AssembleProgress->SetStringField(TEXT("assetRootPath"), AssetRootPath);
	AssembleProgress->SetStringField(TEXT("modelsAssetPath"), ModelsAssetPath);
	AssembleProgress->SetNumberField(TEXT("importedAssetCount"), ImportedAssetCount);
	AssembleProgress->SetNumberField(TEXT("pendingDownloadCount"), PendingDownloadCount);
	UpdateJobStatus(JobId, TEXT("assembling-actor"), TEXT("Creating Unreal Actor asset shell"), AssembleProgress);

	FString BlueprintAssetPath;
	FString BlueprintError;
	if (!CreateSceneBlueprintShell(SceneContentPath, BlueprintAssetName, BlueprintAssetPath, BlueprintError))
	{
		OutMessage = FString::Printf(TEXT("Execution failed: cannot create Actor asset shell. %s"), *BlueprintError);
		return false;
	}

	TSharedPtr<FJsonObject> ComponentProgress = MakeShared<FJsonObject>();
	ComponentProgress->SetStringField(TEXT("stage"), TEXT("Assembling Blueprint static mesh components"));
	ComponentProgress->SetNumberField(TEXT("progress"), 88.0);
	ComponentProgress->SetStringField(TEXT("assetRootPath"), AssetRootPath);
	ComponentProgress->SetStringField(TEXT("modelsAssetPath"), ModelsAssetPath);
	ComponentProgress->SetStringField(TEXT("blueprintAssetPath"), BlueprintAssetPath);
	ComponentProgress->SetNumberField(TEXT("importedAssetCount"), ImportedAssetCount);
	ComponentProgress->SetNumberField(TEXT("pendingDownloadCount"), PendingDownloadCount);
	UpdateJobStatus(JobId, TEXT("assembling-actor"), TEXT("Attaching static mesh components to Blueprint"), ComponentProgress);

	int32 AssembledComponentCount = 0;
	int32 MaterialOverrideCount = 0;
	int32 SkippedSlotCount = 0;
	FString AssembleError;
	const TArray<TSharedPtr<FJsonValue>> EmptyResolvedLayoutSlots;
	const TArray<TSharedPtr<FJsonValue>> EmptyLayoutItems;
	if (!AssembleSceneBlueprintComponents(JobId, BlueprintAssetPath, ModelsAssetPath, ResolvedLayoutSlotsPtr ? *ResolvedLayoutSlotsPtr : EmptyResolvedLayoutSlots, LayoutItemsPtr ? *LayoutItemsPtr : EmptyLayoutItems, ImportedAssets, LayoutProtocolVersion, AssembledComponentCount, MaterialOverrideCount, SkippedSlotCount, AssembleError))
	{
		OutMessage = FString::Printf(TEXT("Execution failed: Blueprint assembly failed. %s"), *AssembleError);
		return false;
	}

	OutResultData->SetStringField(TEXT("blueprintAssetPath"), BlueprintAssetPath);
	OutResultData->SetNumberField(TEXT("assembledComponentCount"), AssembledComponentCount);
	OutResultData->SetNumberField(TEXT("slotCount"), AssembledComponentCount);
	OutResultData->SetNumberField(TEXT("appliedSlotCount"), AssembledComponentCount);
	OutResultData->SetNumberField(TEXT("materialOverrideCount"), MaterialOverrideCount);
	OutResultData->SetNumberField(TEXT("skippedSlotCount"), SkippedSlotCount);
	OutResultData->SetNumberField(TEXT("resolvedSlotCount"), ResolvedLayoutSlotsPtr ? ResolvedLayoutSlotsPtr->Num() : 0);
	OutResultData->SetStringField(TEXT("actorBaseClass"), ADwebWorkflowLayoutActorBase::StaticClass()->GetPathName());
	OutResultData->SetStringField(TEXT("stage"), TEXT("Completed asset shell generation"));
	OutResultData->SetNumberField(TEXT("progress"), 100.0);

	OutResultData->SetStringField(TEXT("sceneName"), SceneName);
	OutMessage = FString::Printf(TEXT("Generated Unreal asset shell: Blueprint=%s, Models=%s, imported %d models, attached %d slots, material overrides %d, pending download %d."), *BlueprintAssetPath, *ModelsAssetPath, ImportedAssetCount, AssembledComponentCount, MaterialOverrideCount, PendingDownloadCount);
	return true;
}

bool FDwebWorkflowBridgeModule::ExecuteLightingOnlyJob(const FString& JobId, const FString& SceneName, const TSharedPtr<FJsonObject>& ExportPayload, FString& OutMessage, TSharedPtr<FJsonObject>& OutResultData)
{
	if (!ExportPayload.IsValid())
	{
		OutMessage = TEXT("Execution failed: lighting job missing exportPayload.");
		return false;
	}

	if (!OutResultData.IsValid())
	{
		OutResultData = MakeShared<FJsonObject>();
	}

	UWorld* World = GetEditorWorld();
	if (!World)
	{
		OutMessage = TEXT("Execution failed: no editor world available.");
		return false;
	}

	AActor* AnchorActor = AutoResolveSceneActor();
	if (!AnchorActor)
	{
		OutMessage = TEXT("Execution failed: no valid scene Actor found. Export a scene layout first.");
		return false;
	}

	const FString LightingJsonText = ReadStringField(ExportPayload, TEXT("lightingJson")).TrimStartAndEnd();
	if (LightingJsonText.IsEmpty())
	{
		OutMessage = TEXT("Execution failed: lighting-only job missing lightingJson." );
		return false;
	}

	TSharedPtr<FJsonObject> LightingRoot;
	if (!ParseJson(LightingJsonText, LightingRoot) || !LightingRoot.IsValid())
	{
		OutMessage = TEXT("Execution failed: lightingJson is not valid JSON." );
		return false;
	}

	const TSharedPtr<FJsonObject> LightingPayload = ReadObjectField(LightingRoot, TEXT("lighting"));
	const TSharedPtr<FJsonObject> EffectiveLightingPayload = LightingPayload.IsValid() ? LightingPayload : LightingRoot;

	TSharedPtr<FJsonObject> ProgressData = MakeShared<FJsonObject>();
	ProgressData->SetStringField(TEXT("stage"), TEXT("Applying lighting to target Actor"));
	ProgressData->SetNumberField(TEXT("progress"), 65.0);
	ProgressData->SetStringField(TEXT("lightingTargetActorPath"), AnchorActor->GetPathName());
	UpdateJobStatus(JobId, TEXT("applying-lighting"), TEXT("Applying lighting to selected Actor"), ProgressData);

	int32 SpawnedLightCount = 0;
	FString LightingError;
	if (!SpawnLightingActors(World, SceneName, EffectiveLightingPayload, AnchorActor, SpawnedLightCount, LightingError))
	{
		OutMessage = FString::Printf(TEXT("Execution failed: lighting generation failed. %s"), *LightingError);
		return false;
	}

	OutResultData->SetStringField(TEXT("sceneName"), SceneName);
	OutResultData->SetStringField(TEXT("stage"), TEXT("Lighting application completed"));
	OutResultData->SetNumberField(TEXT("progress"), 100.0);
	OutResultData->SetNumberField(TEXT("spawnedLightCount"), SpawnedLightCount);
	OutResultData->SetArrayField(TEXT("lightingTypeMapping"), BuildLightingMappingTableJson());
	OutResultData->SetStringField(TEXT("lightingTargetActorPath"), AnchorActor->GetPathName());
#if WITH_EDITOR
	OutResultData->SetStringField(TEXT("lightingTargetActorLabel"), AnchorActor->GetActorLabel());
#endif

	OutMessage = FString::Printf(TEXT("Lighting applied: spawned %d lights near target Actor."), SpawnedLightCount);
	return true;
}

UWorld* FDwebWorkflowBridgeModule::GetEditorWorld() const
{
	return GEditor ? GEditor->GetEditorWorldContext().World() : nullptr;
}

bool FDwebWorkflowBridgeModule::EnsureDirectoryExists(const FString& InDirectory, FString& OutError) const
{
	if (InDirectory.TrimStartAndEnd().IsEmpty())
	{
		OutError = TEXT("Save directory is empty.");
		return false;
	}

	IFileManager::Get().MakeDirectory(*InDirectory, true);
	if (!IFileManager::Get().DirectoryExists(*InDirectory))
	{
		OutError = FString::Printf(TEXT("Failed to create directory: %s"), *InDirectory);
		return false;
	}
	return true;
}

bool FDwebWorkflowBridgeModule::SaveJobManifest(const FString& JobId, const TSharedPtr<FJsonObject>& ExportPayload, FString& OutManifestPath, FString& OutError) const
{
	const FString JobFolderName = SanitizeFileName(JobId.IsEmpty() ? TEXT("uejob") : JobId);
	const FString OutputDirectory = FPaths::Combine(FPaths::ConvertRelativePathToFull(FPaths::ProjectSavedDir() / TEXT("DwebImports")), JobFolderName);
	if (!EnsureDirectoryExists(OutputDirectory, OutError))
	{
		return false;
	}

	OutManifestPath = FPaths::Combine(OutputDirectory, TEXT("scene_export.json"));
	return SaveJsonFile(OutManifestPath, ExportPayload, OutError);
}

bool FDwebWorkflowBridgeModule::SaveJsonFile(const FString& OutputPath, const TSharedPtr<FJsonObject>& JsonObject, FString& OutError) const
{
	if (!JsonObject.IsValid())
	{
		OutError = TEXT("JSON object is null.");
		return false;
	}
	FString PayloadText;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&PayloadText);
	if (!FJsonSerializer::Serialize(JsonObject.ToSharedRef(), Writer))
	{
		OutError = TEXT("JSON serialization failed.");
		return false;
	}
	if (!FFileHelper::SaveStringToFile(PayloadText, *OutputPath))
	{
		OutError = FString::Printf(TEXT("File write failed: %s"), *OutputPath);
		return false;
	}
	return true;
}

bool FDwebWorkflowBridgeModule::ImportReferencedModelAssets(const FString& JobId, const TSharedPtr<FJsonObject>& ExportPayload, const FString& ModelsAssetPath, TArray<TSharedPtr<FJsonValue>>& OutImportedAssets, int32& OutImportedAssetCount, int32& OutPendingDownloadCount, FString& OutError)
{
	OutImportedAssets.Reset();
	OutImportedAssetCount = 0;
	OutPendingDownloadCount = 0;
	OutError.Reset();
	if (!ExportPayload.IsValid())
	{
		OutError = TEXT("exportPayload is empty.");
		return false;
	}

	const TArray<TSharedPtr<FJsonValue>>* ModelBindingsPtr = nullptr;
	const TArray<TSharedPtr<FJsonValue>>* ManualBindingsPtr = nullptr;
	ExportPayload->TryGetArrayField(TEXT("modelBindings"), ModelBindingsPtr);
	ExportPayload->TryGetArrayField(TEXT("manualModelBindings"), ManualBindingsPtr);
	if (!ModelBindingsPtr || ModelBindingsPtr->Num() <= 0)
	{
		return true;
	}

	FString ProjectRootPath = ReadStringField(ExportPayload, TEXT("dwebProjectRootPath")).TrimStartAndEnd();
	if (ProjectRootPath.IsEmpty())
	{
		ProjectRootPath = ReadStringField(ExportPayload, TEXT("projectRootPath")).TrimStartAndEnd();
	}
	if (!ProjectRootPath.IsEmpty())
	{
		ProjectRootPath = NormalizeLocalFilePath(ProjectRootPath);
	}

	if (ProjectRootPath.IsEmpty())
	{
		for (const TSharedPtr<FJsonValue>& BindingValue : *ModelBindingsPtr)
		{
			const TSharedPtr<FJsonObject> BindingObject = BindingValue.IsValid() ? BindingValue->AsObject() : nullptr;
			if (!BindingObject.IsValid())
			{
				continue;
			}
			TArray<FString> CandidatePaths;
			CandidatePaths.Add(ReadStringField(BindingObject, TEXT("modelSourcePath")));
			CandidatePaths.Add(ReadStringField(BindingObject, TEXT("modelAssetPath")));
			for (const FString& Candidate : CandidatePaths)
			{
				FString Trimmed = Candidate.TrimStartAndEnd();
				if (!Trimmed.IsEmpty() && IsAbsolutePath(Trimmed))
				{
					FString Inferred = TryInferProjectRootFromAbsolutePath(Trimmed);
					if (!Inferred.IsEmpty())
					{
						ProjectRootPath = Inferred;
						UE_LOG(LogTemp, Log, TEXT("DwebWorkflow: Inferred project root from model path: %s -> %s"), *Trimmed, *ProjectRootPath);
						break;
					}
				}
			}
			if (!ProjectRootPath.IsEmpty())
			{
				break;
			}
		}
	}

	TMap<FString, TSharedPtr<FJsonObject>> ManualBindingsByObjectId;
	if (ManualBindingsPtr)
	{
		for (const TSharedPtr<FJsonValue>& ManualBindingValue : *ManualBindingsPtr)
		{
			const TSharedPtr<FJsonObject> ManualBindingObject = ManualBindingValue.IsValid() ? ManualBindingValue->AsObject() : nullptr;
			if (!ManualBindingObject.IsValid())
			{
				continue;
			}
			const FString ObjectId = ReadStringField(ManualBindingObject, TEXT("objectId")).TrimStartAndEnd();
			if (!ObjectId.IsEmpty())
			{
				ManualBindingsByObjectId.Add(ObjectId, ManualBindingObject);
			}
		}
	}

	TMap<FString, FString> ImportedPathBySourcePath;
	const int32 TotalBindingCount = ModelBindingsPtr->Num();
	for (int32 BindingIndex = 0; BindingIndex < TotalBindingCount; ++BindingIndex)
	{
		const TSharedPtr<FJsonObject> BindingObject = (*ModelBindingsPtr)[BindingIndex].IsValid() ? (*ModelBindingsPtr)[BindingIndex]->AsObject() : nullptr;
		if (!BindingObject.IsValid())
		{
			continue;
		}

		const FString ObjectId = ReadStringField(BindingObject, TEXT("objectId")).TrimStartAndEnd();
		const FString ObjectName = ReadStringField(BindingObject, TEXT("objectName")).TrimStartAndEnd();
		const FString AssetName = SanitizeIdentifier(!ObjectName.IsEmpty() ? ObjectName : ObjectId, TEXT("Model"));
		const TSharedPtr<FJsonObject>* ManualBindingObjectPtr = ManualBindingsByObjectId.Find(ObjectId);
		const TSharedPtr<FJsonObject> ManualBindingObject = ManualBindingObjectPtr ? *ManualBindingObjectPtr : nullptr;

		FString LocalSourcePath;
		FString SourceLabel;
		bool bRequiresDownload = false;
		ResolveBindingLocalModelSourcePath(BindingObject, ManualBindingObject, ProjectRootPath, LocalSourcePath, SourceLabel, bRequiresDownload);

		const float ProgressBase = 30.0f + (45.0f * (BindingIndex / FMath::Max(1.0f, static_cast<float>(TotalBindingCount))));
		TSharedPtr<FJsonObject> ImportProgress = MakeShared<FJsonObject>();
		ImportProgress->SetStringField(TEXT("stage"), TEXT("Importing 3D model assets"));
		ImportProgress->SetNumberField(TEXT("progress"), ProgressBase);
		ImportProgress->SetStringField(TEXT("modelsAssetPath"), ModelsAssetPath);
		ImportProgress->SetStringField(TEXT("currentObjectId"), ObjectId);
		ImportProgress->SetStringField(TEXT("currentAssetName"), AssetName);
		UpdateJobStatus(JobId, TEXT("importing"), FString::Printf(TEXT("Importing model %s"), *AssetName), ImportProgress);

		if (bRequiresDownload)
		{
			++OutPendingDownloadCount;
			TSharedPtr<FJsonObject> PendingObject = MakeShared<FJsonObject>();
			PendingObject->SetStringField(TEXT("objectId"), ObjectId);
			PendingObject->SetStringField(TEXT("assetName"), AssetName);
			PendingObject->SetStringField(TEXT("source"), SourceLabel);
			PendingObject->SetStringField(TEXT("status"), TEXT("pending-download"));
			OutImportedAssets.Add(MakeShared<FJsonValueObject>(PendingObject));
			continue;
		}

		if (LocalSourcePath.IsEmpty())
		{
			continue;
		}

		const FString NormalizedSourcePath = NormalizeLocalFilePath(LocalSourcePath);
		const FString* ExistingImportedPath = ImportedPathBySourcePath.Find(NormalizedSourcePath);
		if (ExistingImportedPath && !ExistingImportedPath->IsEmpty())
		{
			++OutImportedAssetCount;
			TSharedPtr<FJsonObject> ImportedObject = MakeShared<FJsonObject>();
			ImportedObject->SetStringField(TEXT("objectId"), ObjectId);
			ImportedObject->SetStringField(TEXT("assetName"), AssetName);
			ImportedObject->SetStringField(TEXT("sourceFilePath"), LocalSourcePath);
			ImportedObject->SetStringField(TEXT("assetPath"), *ExistingImportedPath);
			ImportedObject->SetStringField(TEXT("status"), TEXT("imported"));
			OutImportedAssets.Add(MakeShared<FJsonValueObject>(ImportedObject));
			continue;
		}

		FString ImportedAssetPath;
		FString ImportError;
		if (!ImportSingleModelAsset(LocalSourcePath, ModelsAssetPath, AssetName, ImportedAssetPath, ImportError))
		{
			UE_LOG(LogTemp, Warning, TEXT("DwebWorkflow: Skipping model %s (%s): %s"), *AssetName, *LocalSourcePath, *ImportError);
			TSharedPtr<FJsonObject> FailedObject = MakeShared<FJsonObject>();
			FailedObject->SetStringField(TEXT("objectId"), ObjectId);
			FailedObject->SetStringField(TEXT("assetName"), AssetName);
			FailedObject->SetStringField(TEXT("sourceFilePath"), LocalSourcePath);
			FailedObject->SetStringField(TEXT("error"), ImportError);
			FailedObject->SetStringField(TEXT("status"), TEXT("skipped"));
			OutImportedAssets.Add(MakeShared<FJsonValueObject>(FailedObject));
			continue;
		}

		ImportedPathBySourcePath.Add(NormalizedSourcePath, ImportedAssetPath);
		++OutImportedAssetCount;
		TSharedPtr<FJsonObject> ImportedObject = MakeShared<FJsonObject>();
		ImportedObject->SetStringField(TEXT("objectId"), ObjectId);
		ImportedObject->SetStringField(TEXT("assetName"), AssetName);
		ImportedObject->SetStringField(TEXT("sourceFilePath"), LocalSourcePath);
		ImportedObject->SetStringField(TEXT("assetPath"), ImportedAssetPath);
		ImportedObject->SetStringField(TEXT("status"), TEXT("imported"));
		OutImportedAssets.Add(MakeShared<FJsonValueObject>(ImportedObject));
	}

	FlushAllPendingAsyncLoading();

	return true;
}

bool FDwebWorkflowBridgeModule::ImportSingleModelAsset(const FString& SourceFilePath, const FString& ModelsAssetPath, const FString& DesiredAssetName, FString& OutImportedAssetPath, FString& OutError)
{
	const FString NormalizedSourcePath = NormalizeLocalFilePath(SourceFilePath);
	if (!FPaths::FileExists(NormalizedSourcePath))
	{
		OutError = FString::Printf(TEXT("Source file does not exist: %s"), *NormalizedSourcePath);
		return false;
	}

	if (!IsSupportedModelFileExtension(NormalizedSourcePath))
	{
		OutError = FString::Printf(TEXT("Unsupported model format (supported: .glb/.gltf/.fbx/.obj/.stl/.dae): %s"), *NormalizedSourcePath);
		return false;
	}

	UE::Interchange::FScopedSourceData SourceDataScope(NormalizedSourcePath);
	const UInterchangeSourceData* SourceData = SourceDataScope.GetSourceData();
	if (!SourceData)
	{
		OutError = TEXT("Cannot create Interchange SourceData.");
		return false;
	}

	FImportAssetParameters ImportParameters;
	ImportParameters.bIsAutomated = true;
	ImportParameters.bReplaceExisting = true;
	ImportParameters.bFollowRedirectors = true;
	ImportParameters.DestinationName = DesiredAssetName;

	UE::Interchange::FAssetImportResultRef ImportResult = UInterchangeManager::GetInterchangeManager().ImportAssetAsync(ModelsAssetPath, SourceData, ImportParameters);
	if (!ImportResult->IsValid())
	{
		OutError = TEXT("ImportAssetAsync returned invalid result.");
		return false;
	}

	ImportResult->WaitUntilDone(true);
	const TArray<UObject*>& ImportedObjects = ImportResult->GetImportedObjects();
	if (ImportedObjects.Num() <= 0)
	{
		OutError = TEXT("Interchange did not return import result object.");
		return false;
	}

	UObject* PreferredObject = ImportResult->GetFirstAssetOfClass(UStaticMesh::StaticClass());
	if (!PreferredObject)
	{
		PreferredObject = ImportedObjects[0];
	}
	if (!PreferredObject)
	{
		OutError = TEXT("Interchange import succeeded but no usable asset objects found.");
		return false;
	}

	UStaticMesh* ImportedStaticMesh = Cast<UStaticMesh>(PreferredObject);
	if (ImportedStaticMesh)
	{
		EnsureStaticMeshFullyLoaded(ImportedStaticMesh);
	}
	else
	{
		FlushAllPendingAsyncLoading();
	}

	OutImportedAssetPath = PreferredObject->GetPathName();
	return true;
}

bool FDwebWorkflowBridgeModule::ResolveBindingLocalModelSourcePath(const TSharedPtr<FJsonObject>& BindingObject, const TSharedPtr<FJsonObject>& ManualBindingObject, const FString& ProjectRootPath, FString& OutSourceFilePath, FString& OutSourceLabel, bool& bOutRequiresDownload) const
{
	OutSourceFilePath.Reset();
	OutSourceLabel.Reset();
	bOutRequiresDownload = false;

	auto TrySetValidSourcePath = [&](const FString& CandidatePath, const FString& Label) -> bool
	{
		FString Normalized = NormalizeLocalFilePath(CandidatePath);
		if (FPaths::FileExists(Normalized) && IsSupportedModelFileExtension(Normalized))
		{
			OutSourceFilePath = Normalized;
			OutSourceLabel = Label.IsEmpty() ? OutSourceFilePath : Label;
			bOutRequiresDownload = false;
			return true;
		}

		FString FixedPath = TryFixDvcacheBinPath(CandidatePath, ProjectRootPath);
		if (!FixedPath.IsEmpty())
		{
			FString FixedNormalized = NormalizeLocalFilePath(FixedPath);
			if (FPaths::FileExists(FixedNormalized) && IsSupportedModelFileExtension(FixedNormalized))
			{
				OutSourceFilePath = FixedNormalized;
				OutSourceLabel = Label.IsEmpty() ? (OutSourceFilePath + TEXT(" [fixed-from-dvcache]")) : (Label + TEXT(" [fixed-from-dvcache]"));
				bOutRequiresDownload = false;
				UE_LOG(LogTemp, Warning, TEXT("DwebWorkflow: Fixed dvcache path '%s' -> '%s'"), *CandidatePath, *FixedNormalized);
				return true;
			}
		}

		return false;
	};

	auto TryPickCandidate = [&](const FString& Candidate, const FString& Label) -> bool
	{
		const FString Trimmed = Candidate.TrimStartAndEnd();
		if (Trimmed.IsEmpty())
		{
			return false;
		}

		if (IsHttpLikeUrl(Trimmed))
		{
			bOutRequiresDownload = true;
			OutSourceLabel = Label.IsEmpty() ? Trimmed : Label;
			return false;
		}

		const FString LowerTrimmed = Trimmed.ToLower();
		const bool bLikelyDvcacheBin = LowerTrimmed.Contains(TEXT(".dvcache")) && LowerTrimmed.Contains(TEXT("bin"));

		if (IsDwebProjectAssetUrl(Trimmed))
		{
			FString RelativePath;
			if (ParseDwebProjectAssetUrl(Trimmed, RelativePath))
			{
				if (TrySetValidSourcePath(RelativePath, Label + TEXT(":dweb-parsed")))
				{
					return true;
				}
				if (!ProjectRootPath.IsEmpty())
				{
					FString Resolved = TryResolvePathWithProjectRoot(RelativePath, ProjectRootPath);
					if (!Resolved.IsEmpty())
					{
						OutSourceFilePath = Resolved;
						OutSourceLabel = Label.IsEmpty() ? OutSourceFilePath : Label;
						bOutRequiresDownload = false;
						return true;
					}
					FString FixedRel = TryFixDvcacheBinPath(RelativePath, ProjectRootPath);
					if (!FixedRel.IsEmpty())
					{
						FString FixedNorm = NormalizeLocalFilePath(FixedRel);
						if (FPaths::FileExists(FixedNorm) && IsSupportedModelFileExtension(FixedNorm))
						{
							OutSourceFilePath = FixedNorm;
							OutSourceLabel = Label + TEXT(" [fixed-from-dvcache]");
							bOutRequiresDownload = false;
							UE_LOG(LogTemp, Warning, TEXT("DwebWorkflow: Fixed dvcache dweb path '%s' -> '%s'"), *RelativePath, *FixedNorm);
							return true;
						}
					}
				}
			}
			return false;
		}

		if (bLikelyDvcacheBin)
		{
			if (TrySetValidSourcePath(Trimmed, Label))
			{
				return true;
			}
		}

		if (IsSupportedModelFileExtension(Trimmed))
		{
			if (TrySetValidSourcePath(Trimmed, Label))
			{
				return true;
			}

			if (!IsAbsolutePath(Trimmed) && !ProjectRootPath.IsEmpty())
			{
				FString Resolved = TryResolvePathWithProjectRoot(Trimmed, ProjectRootPath);
				if (!Resolved.IsEmpty())
				{
					OutSourceFilePath = Resolved;
					OutSourceLabel = Label.IsEmpty() ? OutSourceFilePath : Label;
					bOutRequiresDownload = false;
					return true;
				}
			}
		}

		if (IsLikelyLocalFilePath(Trimmed) && (IsSupportedModelFileExtension(Trimmed) || bLikelyDvcacheBin))
		{
			return TrySetValidSourcePath(Trimmed, Label);
		}

		return false;
	};

	if (ManualBindingObject.IsValid())
	{
		if (TryPickCandidate(ReadStringField(ManualBindingObject, TEXT("modelSourcePath")), TEXT("manual:modelSourcePath")))
		{
			return true;
		}
		if (TryPickCandidate(ReadStringField(ManualBindingObject, TEXT("modelAssetPath")), TEXT("manual:modelAssetPath")))
		{
			return true;
		}
		if (TryPickCandidate(ReadStringField(ManualBindingObject, TEXT("modelAssetUrl")), TEXT("manual:modelAssetUrl")))
		{
			return true;
		}
		if (TryPickCandidate(ReadStringField(ManualBindingObject, TEXT("modelUrl")), TEXT("manual:modelUrl")))
		{
			return true;
		}
	}

	if (BindingObject.IsValid())
	{
		if (TryPickCandidate(ReadStringField(BindingObject, TEXT("modelSourcePath")), TEXT("binding:modelSourcePath")))
		{
			return true;
		}
		if (TryPickCandidate(ReadStringField(BindingObject, TEXT("modelAssetPath")), TEXT("binding:modelAssetPath")))
		{
			return true;
		}
		if (TryPickCandidate(ReadStringField(BindingObject, TEXT("modelAssetUrl")), TEXT("binding:modelAssetUrl")))
		{
			return true;
		}
		if (TryPickCandidate(ReadStringField(BindingObject, TEXT("modelUrl")), TEXT("binding:modelUrl")))
		{
			return true;
		}
	}

	return false;
}

FString FDwebWorkflowBridgeModule::BuildSceneContentPath(const FString& SceneName) const
{
	FString RootPath = AssetRootPath.TrimStartAndEnd();
	while (RootPath.EndsWith(TEXT("/")))
	{
		RootPath.LeftChopInline(1);
	}
	if (RootPath.IsEmpty())
	{
		RootPath = TEXT("/Game/DwebWorkflowExports");
	}
	if (!RootPath.StartsWith(TEXT("/Game")))
	{
		RootPath = TEXT("/Game/DwebWorkflowExports");
	}
	return RootPath / FString::Printf(TEXT("Scene_%s"), *SanitizeIdentifier(SceneName, TEXT("Scene")));
}

FString FDwebWorkflowBridgeModule::SanitizeIdentifier(const FString& InValue, const FString& Prefix) const
{
	FString Sanitized;
	for (const TCHAR Char : InValue)
	{
		if ((Char >= TEXT('a') && Char <= TEXT('z')) || (Char >= TEXT('A') && Char <= TEXT('Z')) || (Char >= TEXT('0') && Char <= TEXT('9')))
		{
			Sanitized.AppendChar(Char);
		}
		else if (Char == TEXT('_') || Char == TEXT('-') || Char == TEXT(' '))
		{
			Sanitized.AppendChar(TEXT('_'));
		}
	}
	while (Sanitized.Contains(TEXT("__")))
	{
		Sanitized = Sanitized.Replace(TEXT("__"), TEXT("_"));
	}
	Sanitized.TrimStartAndEndInline();
	while (Sanitized.StartsWith(TEXT("_"))) Sanitized.RightChopInline(1);
	while (Sanitized.EndsWith(TEXT("_"))) Sanitized.LeftChopInline(1);
	if (Sanitized.IsEmpty())
	{
		Sanitized = Prefix.IsEmpty() ? TEXT("Item") : Prefix;
	}
	if (!(Sanitized[0] >= TEXT('A') && Sanitized[0] <= TEXT('Z')) && !(Sanitized[0] >= TEXT('a') && Sanitized[0] <= TEXT('z')))
	{
		Sanitized = (Prefix.IsEmpty() ? TEXT("Item") : Prefix) + TEXT("_") + Sanitized;
	}
	return SanitizeFileName(Sanitized);
}

bool FDwebWorkflowBridgeModule::CreateSceneBlueprintShell(const FString& SceneContentPath, const FString& BlueprintAssetName, FString& OutBlueprintAssetPath, FString& OutError)
{
	FAssetToolsModule& AssetToolsModule = FModuleManager::LoadModuleChecked<FAssetToolsModule>(TEXT("AssetTools"));
	IAssetTools& AssetTools = AssetToolsModule.Get();
	const FString RequestedObjectPath = SceneContentPath / SanitizeIdentifier(BlueprintAssetName, TEXT("SceneActor"));
	FString UniquePackageName;
	FString UniqueAssetName;
	AssetTools.CreateUniqueAssetName(RequestedObjectPath, TEXT(""), UniquePackageName, UniqueAssetName);
	UPackage* Package = CreatePackage(*UniquePackageName);
	if (!Package)
	{
		OutError = FString::Printf(TEXT("CreatePackage failed: %s"), *UniquePackageName);
		return false;
	}
	UBlueprint* Blueprint = FKismetEditorUtilities::CreateBlueprint(
		ADwebWorkflowLayoutActorBase::StaticClass(),
		Package,
		*UniqueAssetName,
		BPTYPE_Normal,
		UBlueprint::StaticClass(),
		UBlueprintGeneratedClass::StaticClass(),
		TEXT("DwebWorkflowBridge")
	);
	if (!Blueprint)
	{
		OutError = TEXT("CreateBlueprint returned null.");
		return false;
	}
	FAssetRegistryModule::AssetCreated(Blueprint);
	Blueprint->MarkPackageDirty();
	Package->MarkPackageDirty();
	OutBlueprintAssetPath = UniquePackageName + TEXT(".") + UniqueAssetName;
	return true;
}

bool FDwebWorkflowBridgeModule::AssembleSceneBlueprintComponents(const FString& JobId, const FString& BlueprintAssetPath, const FString& ModelsAssetPath, const TArray<TSharedPtr<FJsonValue>>& ResolvedLayoutSlots, const TArray<TSharedPtr<FJsonValue>>& LayoutItems, const TArray<TSharedPtr<FJsonValue>>& ImportedAssets, int32 LayoutProtocolVersion, int32& OutAssembledComponentCount, int32& OutMaterialOverrideCount, int32& OutSkippedSlotCount, FString& OutError)
{
	OutAssembledComponentCount = 0;
	OutMaterialOverrideCount = 0;
	OutSkippedSlotCount = 0;
	OutError.Reset();

	if (BlueprintAssetPath.TrimStartAndEnd().IsEmpty())
	{
		OutError = TEXT("BlueprintAssetPath is empty.");
		return false;
	}

	UBlueprint* Blueprint = LoadObject<UBlueprint>(nullptr, *BlueprintAssetPath);
	if (!Blueprint)
	{
		OutError = FString::Printf(TEXT("Cannot load Blueprint: %s"), *BlueprintAssetPath);
		return false;
	}

	if (!Blueprint->GeneratedClass)
	{
		FKismetEditorUtilities::CompileBlueprint(Blueprint);
	}

	ADwebWorkflowLayoutActorBase* LayoutDefaults = Blueprint->GeneratedClass
		? Cast<ADwebWorkflowLayoutActorBase>(Blueprint->GeneratedClass->GetDefaultObject())
		: nullptr;
	if (!LayoutDefaults)
	{
		OutError = TEXT("Blueprint default object is not ADwebWorkflowLayoutActorBase.");
		return false;
	}

	TMap<FString, UStaticMesh*> ImportedMeshByObjectId;
	TMap<FString, FString> ImportedAssetPathByObjectId;
	TMap<FString, FString> ImportedSourcePathByObjectId;
	for (const TSharedPtr<FJsonValue>& ImportedValue : ImportedAssets)
	{
		const TSharedPtr<FJsonObject> ImportedObject = ImportedValue.IsValid() ? ImportedValue->AsObject() : nullptr;
		if (!ImportedObject.IsValid())
		{
			continue;
		}

		const FString Status = ReadStringField(ImportedObject, TEXT("status")).TrimStartAndEnd();
		if (!Status.Equals(TEXT("imported"), ESearchCase::IgnoreCase))
		{
			continue;
		}

		const FString ObjectId = ReadStringField(ImportedObject, TEXT("objectId")).TrimStartAndEnd();
		const FString AssetPath = ReadStringField(ImportedObject, TEXT("assetPath")).TrimStartAndEnd();
		if (ObjectId.IsEmpty() || AssetPath.IsEmpty())
		{
			continue;
		}

		if (UStaticMesh* StaticMesh = LoadObject<UStaticMesh>(nullptr, *AssetPath))
		{
			EnsureStaticMeshFullyLoaded(StaticMesh);
			ImportedMeshByObjectId.Add(ObjectId, StaticMesh);
			ImportedAssetPathByObjectId.Add(ObjectId, AssetPath);
			ImportedSourcePathByObjectId.Add(ObjectId, ReadStringField(ImportedObject, TEXT("sourceFilePath")));
		}
	}

	FlushAllPendingAsyncLoading();

	if (ImportedMeshByObjectId.Num() <= 0 || (LayoutItems.Num() <= 0 && ResolvedLayoutSlots.Num() <= 0))
	{
		LayoutDefaults->Modify();
		LayoutDefaults->LayoutSlots.Reset();
		LayoutDefaults->ImportSummary.LastImportJobId = JobId;
		LayoutDefaults->ImportSummary.BlueprintAssetPath = BlueprintAssetPath;
		LayoutDefaults->ImportSummary.ModelsAssetPath = ModelsAssetPath;
		LayoutDefaults->ImportSummary.ActorBaseClass = ADwebWorkflowLayoutActorBase::StaticClass()->GetPathName();
		LayoutDefaults->ImportSummary.LayoutProtocolVersion = LayoutProtocolVersion;
		LayoutDefaults->ImportSummary.SlotCount = 0;
		LayoutDefaults->ImportSummary.AppliedSlotCount = 0;
		LayoutDefaults->ImportSummary.MaterialOverrideCount = 0;
		LayoutDefaults->ImportSummary.SkippedSlotCount = 0;
		LayoutDefaults->ImportSummary.Warnings.Reset();
		LayoutDefaults->LastImportJobId = JobId;
		return true;
	}

	TArray<FDwebWorkflowLayoutSlot> LayoutSlots;
	TArray<FString> SummaryWarnings;
	LayoutSlots.Reserve(ResolvedLayoutSlots.Num() > 0 ? ResolvedLayoutSlots.Num() : LayoutItems.Num());

	if (ResolvedLayoutSlots.Num() > 0)
	{
		for (int32 Index = 0; Index < ResolvedLayoutSlots.Num(); ++Index)
		{
			const TSharedPtr<FJsonObject> ResolvedObject = ResolvedLayoutSlots[Index].IsValid() ? ResolvedLayoutSlots[Index]->AsObject() : nullptr;
			if (!ResolvedObject.IsValid())
			{
				continue;
			}

			const FString SourceObjectId = ReadStringField(ResolvedObject, TEXT("sourceObjectId")).TrimStartAndEnd();
			UStaticMesh* const* StaticMeshPtr = ImportedMeshByObjectId.Find(SourceObjectId);
			if (!StaticMeshPtr || !*StaticMeshPtr)
			{
				++OutSkippedSlotCount;
				SummaryWarnings.Add(FString::Printf(TEXT("Resolved slot %s missing imported static mesh, skipped."), *ReadStringField(ResolvedObject, TEXT("slotId"), SourceObjectId)));
				continue;
			}

			const FString SlotId = SanitizeIdentifier(ReadStringField(ResolvedObject, TEXT("slotId"), SourceObjectId), TEXT("Slot"));
			const TSharedPtr<FJsonObject> SurfaceSemanticsObject = ReadObjectField(ResolvedObject, TEXT("surfaceSemantics"));
			const TSharedPtr<FJsonObject> ParentReferenceObject = ReadObjectField(ResolvedObject, TEXT("parentReference"));
			const TSharedPtr<FJsonObject> ConstraintDiagnosticsObject = ReadObjectField(ResolvedObject, TEXT("constraintDiagnostics"));
			const FString ParentReferenceMode = ReadStringField(ParentReferenceObject, TEXT("mode")).TrimStartAndEnd();
			const FString RawParentSlotId = ParentReferenceMode.Equals(TEXT("parent-slot"), ESearchCase::IgnoreCase)
				? ReadStringField(ParentReferenceObject, TEXT("targetSlotId"), ReadStringField(ResolvedObject, TEXT("parentSlotId"))).TrimStartAndEnd()
				: ReadStringField(ResolvedObject, TEXT("parentSlotId")).TrimStartAndEnd();
			const FString ParentSlotId = RawParentSlotId.IsEmpty() ? FString() : SanitizeIdentifier(RawParentSlotId, TEXT("Slot"));
			const FString ParentSourceObjectId = ParentReferenceMode.Equals(TEXT("parent-slot"), ESearchCase::IgnoreCase)
				? ReadStringField(ParentReferenceObject, TEXT("targetObjectId"), ReadStringField(ResolvedObject, TEXT("parentSourceObjectId"))).TrimStartAndEnd()
				: ReadStringField(ResolvedObject, TEXT("parentSourceObjectId")).TrimStartAndEnd();
			const FString DisplayName = ReadStringField(ResolvedObject, TEXT("displayName"), ReadStringField(ResolvedObject, TEXT("sourceObjectName"), SourceObjectId));
			const TSharedPtr<FJsonObject> SlotTransformObject = ReadObjectField(ResolvedObject, TEXT("slotTransform"));
			const TSharedPtr<FJsonObject> SlotPositionObject = ReadObjectField(SlotTransformObject, TEXT("position"));
			const TSharedPtr<FJsonObject> SlotRotationObject = ReadObjectField(SlotTransformObject, TEXT("rotation"));
			const TSharedPtr<FJsonObject> SlotScaleObject = ReadObjectField(SlotTransformObject, TEXT("scale"));
			const TSharedPtr<FJsonObject> MeshTransformObject = ReadObjectField(ResolvedObject, TEXT("meshTransform"));
			const TSharedPtr<FJsonObject> MeshPositionObject = ReadObjectField(MeshTransformObject, TEXT("position"));
			const TSharedPtr<FJsonObject> MeshRotationObject = ReadObjectField(MeshTransformObject, TEXT("rotation"));
			const TSharedPtr<FJsonObject> MeshScaleObject = ReadObjectField(MeshTransformObject, TEXT("scale"));
			const TSharedPtr<FJsonObject> PreviewInstanceTransformObject = ReadObjectField(ResolvedObject, TEXT("previewInstanceTransform"));
			const TSharedPtr<FJsonObject> PreviewInstancePositionObject = ReadObjectField(PreviewInstanceTransformObject, TEXT("position"));
			const TSharedPtr<FJsonObject> PreviewInstanceRotationObject = ReadObjectField(PreviewInstanceTransformObject, TEXT("rotation"));
			const TSharedPtr<FJsonObject> PreviewInstanceQuaternionObject = ReadObjectField(PreviewInstanceTransformObject, TEXT("quaternion"));
			const TSharedPtr<FJsonObject> PreviewInstanceScaleObject = ReadObjectField(PreviewInstanceTransformObject, TEXT("scale"));
			const TSharedPtr<FJsonObject> PreviewInstanceWorldTransformObject = ReadObjectField(ResolvedObject, TEXT("previewInstanceWorldTransform"));
			const TSharedPtr<FJsonObject> PreviewInstanceWorldPositionObject = ReadObjectField(PreviewInstanceWorldTransformObject, TEXT("position"));
			const TSharedPtr<FJsonObject> PreviewInstanceWorldRotationObject = ReadObjectField(PreviewInstanceWorldTransformObject, TEXT("rotation"));
			const TSharedPtr<FJsonObject> PreviewInstanceWorldScaleObject = ReadObjectField(PreviewInstanceWorldTransformObject, TEXT("scale"));
			const TSharedPtr<FJsonObject> RelativeTransformObject = ReadObjectField(ResolvedObject, TEXT("relativeTransform"));
			const TSharedPtr<FJsonObject> RelativePositionObject = ReadObjectField(RelativeTransformObject, TEXT("position"));
			const TSharedPtr<FJsonObject> RelativeRotationObject = ReadObjectField(RelativeTransformObject, TEXT("rotation"));
			const TSharedPtr<FJsonObject> RelativeQuaternionObject = ReadObjectField(RelativeTransformObject, TEXT("quaternion"));
			const TSharedPtr<FJsonObject> RelativeScaleObject = ReadObjectField(RelativeTransformObject, TEXT("scale"));
			const TSharedPtr<FJsonObject> WorldTransformObject = ReadObjectField(ResolvedObject, TEXT("worldTransform"));
			const TSharedPtr<FJsonObject> WorldPositionObject = ReadObjectField(WorldTransformObject, TEXT("position"));
			const TSharedPtr<FJsonObject> WorldRotationObject = ReadObjectField(WorldTransformObject, TEXT("rotation"));
			const TSharedPtr<FJsonObject> WorldScaleObject = ReadObjectField(WorldTransformObject, TEXT("scale"));
			const TSharedPtr<FJsonObject> WorldBoundsObject = ReadObjectField(ResolvedObject, TEXT("worldBounds"));
			const TSharedPtr<FJsonObject> WorldBoundsSizeObject = ReadObjectField(WorldBoundsObject, TEXT("size"));
			const TSharedPtr<FJsonObject> PlaceholderBoundsObject = ReadObjectField(ResolvedObject, TEXT("placeholderBounds"));
			const TSharedPtr<FJsonObject> PlaceholderBoundsSizeObject = ReadObjectField(PlaceholderBoundsObject, TEXT("size"));
			const TSharedPtr<FJsonObject> ModelBindingObject = ReadObjectField(ResolvedObject, TEXT("modelBinding"));
			const TSharedPtr<FJsonObject> ManualAdjustmentObject = ReadObjectField(ResolvedObject, TEXT("manualAdjustment"));
			const bool bUseDirectPreviewTransform = LayoutProtocolVersion >= 4 && PreviewInstanceTransformObject.IsValid();
			const bool bManualAdjustmentApplied = ReadBoolField(ResolvedObject, TEXT("manualAdjustmentApplied"), false);
			const FString ManualOrientationMode = ReadStringField(ManualAdjustmentObject, TEXT("orientationMode")).TrimStartAndEnd();
			const FString ManualFitMode = ReadStringField(ManualAdjustmentObject, TEXT("fitMode")).TrimStartAndEnd();
			const FString ManualFillMode = ReadStringField(ManualAdjustmentObject, TEXT("fillMode")).TrimStartAndEnd();
			const bool bUseManualRecoveryPath = bUseDirectPreviewTransform && (
				bManualAdjustmentApplied ||
				ManualOrientationMode.Equals(TEXT("manual"), ESearchCase::IgnoreCase) ||
				ManualFitMode.Equals(TEXT("forced"), ESearchCase::IgnoreCase) ||
				(ManualFillMode.StartsWith(TEXT("fill-"), ESearchCase::IgnoreCase) && !ManualFillMode.Equals(TEXT("single"), ESearchCase::IgnoreCase))
			);
			const TSharedPtr<FJsonObject> EffectiveRelativePositionObject = bUseDirectPreviewTransform ? PreviewInstancePositionObject : RelativePositionObject;
			const TSharedPtr<FJsonObject> EffectiveRelativeRotationObject = bUseDirectPreviewTransform ? PreviewInstanceRotationObject : RelativeRotationObject;
			const TSharedPtr<FJsonObject> EffectiveRelativeQuaternionObject = bUseDirectPreviewTransform ? PreviewInstanceQuaternionObject : RelativeQuaternionObject;
			const TSharedPtr<FJsonObject> EffectiveRelativeScaleObject = bUseDirectPreviewTransform ? PreviewInstanceScaleObject : RelativeScaleObject;
			const TSharedPtr<FJsonObject> EffectiveWorldPositionObject = PreviewInstanceWorldTransformObject.IsValid() ? PreviewInstanceWorldPositionObject : WorldPositionObject;
			const TSharedPtr<FJsonObject> EffectiveWorldRotationObject = PreviewInstanceWorldTransformObject.IsValid() ? PreviewInstanceWorldRotationObject : WorldRotationObject;
			const TSharedPtr<FJsonObject> EffectiveWorldScaleObject = PreviewInstanceWorldTransformObject.IsValid() ? PreviewInstanceWorldScaleObject : WorldScaleObject;

			FDwebWorkflowLayoutSlot Slot;
			Slot.SlotId = SlotId;
			Slot.ParentSlotId = bUseDirectPreviewTransform ? FString() : ParentSlotId;
			Slot.DisplayName = DisplayName;
			Slot.SourceObjectId = SourceObjectId;
			Slot.SourceObjectName = ReadStringField(ResolvedObject, TEXT("sourceObjectName"), DisplayName);
			Slot.ParentSourceObjectId = bUseDirectPreviewTransform ? FString() : ParentSourceObjectId;
			Slot.SourceSlotId = ReadStringField(ResolvedObject, TEXT("sourceSlotId"), SourceObjectId);
			Slot.StaticMeshAsset = *StaticMeshPtr;
			Slot.StaticMeshAssetPath = ImportedAssetPathByObjectId.FindRef(SourceObjectId);
			Slot.SurfaceSemantics.Category = ReadStringField(SurfaceSemanticsObject, TEXT("category"));
			Slot.SurfaceSemantics.Placement = ReadStringField(SurfaceSemanticsObject, TEXT("placement"));
			Slot.SurfaceSemantics.SupportSurface = ReadStringField(SurfaceSemanticsObject, TEXT("supportSurface"));
			Slot.SurfaceSemantics.MountType = ReadStringField(SurfaceSemanticsObject, TEXT("mountType"));
			Slot.SurfaceSemantics.WallRole = ReadStringField(SurfaceSemanticsObject, TEXT("wallRole"));
			Slot.SurfaceSemantics.Anchor = ReadStringField(SurfaceSemanticsObject, TEXT("anchor"));
			Slot.SurfaceSemantics.SemanticRole = ReadStringField(SurfaceSemanticsObject, TEXT("semanticRole"));
			Slot.ParentReference.Mode = bUseDirectPreviewTransform ? TEXT("root") : ParentReferenceMode;
			Slot.ParentReference.TargetObjectId = bUseDirectPreviewTransform ? FString() : ReadStringField(ParentReferenceObject, TEXT("targetObjectId"));
			Slot.ParentReference.TargetSlotId = bUseDirectPreviewTransform ? FString() : ReadStringField(ParentReferenceObject, TEXT("targetSlotId"));
			Slot.ParentReference.ParentAnchor = ReadStringField(ParentReferenceObject, TEXT("parentAnchor"));
			Slot.ParentReference.ChildAnchor = ReadStringField(ParentReferenceObject, TEXT("childAnchor"));
			Slot.ConstraintDiagnostics.ExportMode = bUseDirectPreviewTransform ? TEXT("direct-preview-transform-hierarchy") : ReadStringField(ConstraintDiagnosticsObject, TEXT("exportMode"));
			Slot.ConstraintDiagnostics.Notes = ReadStringArrayField(ConstraintDiagnosticsObject, TEXT("notes"));
			Slot.TransformData.ScenePosition = FVector(
				ReadNumberField(EffectiveWorldPositionObject, TEXT("x"), 0.0),
				ReadNumberField(EffectiveWorldPositionObject, TEXT("y"), 0.0),
				ReadNumberField(EffectiveWorldPositionObject, TEXT("z"), 0.0));
			Slot.TransformData.SceneRotation = SceneRotationToUnreal(EffectiveWorldRotationObject);
			Slot.TransformData.SceneScale = FVector(
				ReadNumberField(EffectiveWorldScaleObject, TEXT("x"), 1.0),
				ReadNumberField(EffectiveWorldScaleObject, TEXT("y"), 1.0),
				ReadNumberField(EffectiveWorldScaleObject, TEXT("z"), 1.0));
			Slot.TransformData.RelativeTransform = bUseDirectPreviewTransform
				? FTransform::Identity
				: SlotTransformObject.IsValid()
				? FTransform(
					SceneRotationToUnreal(SlotRotationObject).Quaternion(),
					ScenePointToUnreal(SlotPositionObject),
					SceneScaleToUnreal(SlotScaleObject))
				: FTransform(
					SceneRotationToUnreal(EffectiveRelativeRotationObject).Quaternion(),
					ScenePointToUnreal(EffectiveRelativePositionObject),
					SceneScaleToUnreal(EffectiveRelativeScaleObject));
			Slot.MeshRelativeTransform = bUseDirectPreviewTransform
				? [&]()
				{
					const bool bHasQuaternionRotation = EffectiveRelativeQuaternionObject.IsValid();
					const FRotator DirectRelativeRotator = bHasQuaternionRotation
						? SceneQuaternionToUnreal(EffectiveRelativeQuaternionObject, EffectiveRelativeRotationObject)
						: SceneRotationToUnreal(EffectiveRelativeRotationObject);
					if (bUseManualRecoveryPath)
					{
						UE_LOG(LogTemp, Log, TEXT("[Dweb][ManualPath] slot=%s source=%s rotSource=%s q=(%.6f,%.6f,%.6f,%.6f) euler=(yaw=%.3f,pitch=%.3f,roll=%.3f) ueRot=(P=%.3f,Y=%.3f,R=%.3f)"),
							*SlotId,
							*SourceObjectId,
							bHasQuaternionRotation ? TEXT("quaternion") : TEXT("euler-fallback"),
							ReadNumberField(EffectiveRelativeQuaternionObject, TEXT("x"), 0.0),
							ReadNumberField(EffectiveRelativeQuaternionObject, TEXT("y"), 0.0),
							ReadNumberField(EffectiveRelativeQuaternionObject, TEXT("z"), 0.0),
							ReadNumberField(EffectiveRelativeQuaternionObject, TEXT("w"), 1.0),
							ReadNumberField(EffectiveRelativeRotationObject, TEXT("yaw"), 0.0),
							ReadNumberField(EffectiveRelativeRotationObject, TEXT("pitch"), 0.0),
							ReadNumberField(EffectiveRelativeRotationObject, TEXT("roll"), 0.0),
							DirectRelativeRotator.Pitch,
							DirectRelativeRotator.Yaw,
							DirectRelativeRotator.Roll);
					}
					return FTransform(
						DirectRelativeRotator.Quaternion(),
						ScenePointToUnreal(EffectiveRelativePositionObject),
						SceneScaleToUnreal(EffectiveRelativeScaleObject));
				}()
				: MeshTransformObject.IsValid()
				? FTransform(
					SceneRotationToUnreal(MeshRotationObject).Quaternion(),
					ScenePointToUnreal(MeshPositionObject),
					SceneScaleToUnreal(MeshScaleObject))
				: FTransform::Identity;
			Slot.TransformData.WorldTransform = FTransform(
				SceneRotationToUnreal(EffectiveWorldRotationObject).Quaternion(),
				ScenePointToUnreal(EffectiveWorldPositionObject),
				SceneScaleToUnreal(EffectiveWorldScaleObject));
			Slot.TransformData.FitMode = ReadStringField(ResolvedObject, TEXT("fitMode"));
			Slot.TransformData.FillMode = ReadStringField(ResolvedObject, TEXT("fillMode"));
			Slot.TransformData.PreviewScaleMode = ReadStringField(ResolvedObject, TEXT("previewScaleMode"));
			Slot.TransformData.FillCount = FMath::Max(1, static_cast<int32>(ReadNumberField(ResolvedObject, TEXT("fillCount"), 1.0)));
			Slot.TransformData.FillAxisScale = static_cast<float>(ReadNumberField(ResolvedObject, TEXT("fillAxisScale"), 1.0));
			Slot.TransformData.FillCloneIndex = FMath::Max(0, static_cast<int32>(ReadNumberField(ResolvedObject, TEXT("cloneIndex"), 0.0)));
			Slot.TransformData.FillCloneCount = FMath::Max(1, static_cast<int32>(ReadNumberField(ResolvedObject, TEXT("cloneCount"), 1.0)));
			Slot.TransformData.bFillClone = ReadBoolField(ResolvedObject, TEXT("isClone"), false);
			Slot.TransformData.bDerivedFromPreview = true;
			Slot.TransformData.SourceLayoutItemId = SourceObjectId;
			Slot.TransformData.ParentLayoutItemId = bUseDirectPreviewTransform ? FString() : ParentSourceObjectId;
			Slot.PlaceholderSize = SceneVectorSizeToUnreal(PlaceholderBoundsSizeObject);
			Slot.WorldBoundsSize = SceneVectorSizeToUnreal(WorldBoundsSizeObject);
			Slot.PlaceholderBoundsSize = SceneVectorSizeToUnreal(PlaceholderBoundsSizeObject);
			Slot.Tags = ReadStringArrayField(ResolvedObject, TEXT("relationTags"));
			Slot.Notes = ReadStringField(ResolvedObject, TEXT("notes"));
			Slot.SourceModelPath = ReadStringField(ModelBindingObject, TEXT("modelSourcePath"), ReadStringField(ModelBindingObject, TEXT("modelAssetPath")));
			Slot.SourceBindingType = ReadStringField(ModelBindingObject, TEXT("sourceNodeType"), ReadStringField(ResolvedObject, TEXT("previewScaleMode")));
			Slot.LastImportedAt = FDateTime::UtcNow().ToUnixTimestamp();
			Slot.bDerivedSlot = ReadBoolField(ResolvedObject, TEXT("isClone"), false);

			const TArray<TSharedPtr<FJsonValue>>* MaterialOverridesPtr = nullptr;
			if (ResolvedObject->TryGetArrayField(TEXT("materialOverrides"), MaterialOverridesPtr) && MaterialOverridesPtr)
			{
				for (const TSharedPtr<FJsonValue>& OverrideValue : *MaterialOverridesPtr)
				{
					const TSharedPtr<FJsonObject> OverrideObject = OverrideValue.IsValid() ? OverrideValue->AsObject() : nullptr;
					if (!OverrideObject.IsValid())
					{
						continue;
					}

					FDwebWorkflowMaterialOverride MaterialOverride;
					MaterialOverride.MaterialSlotName = FName(*ReadStringField(OverrideObject, TEXT("materialSlotName")));
					MaterialOverride.MaterialAssetPath = ReadStringField(OverrideObject, TEXT("materialAssetPath"));
					MaterialOverride.bEnabled = !OverrideObject->HasField(TEXT("enabled")) || OverrideObject->GetBoolField(TEXT("enabled"));
					MaterialOverride.Source = ReadStringField(OverrideObject, TEXT("source"));
					if (!MaterialOverride.MaterialAssetPath.IsEmpty())
					{
						MaterialOverride.MaterialInterface = LoadObject<UMaterialInterface>(nullptr, *MaterialOverride.MaterialAssetPath);
						if (!MaterialOverride.MaterialInterface)
						{
							MaterialOverride.bEnabled = false;
						}
					}
					else
					{
						MaterialOverride.bEnabled = false;
					}
					if (MaterialOverride.bEnabled && MaterialOverride.MaterialInterface)
					{
						Slot.MaterialOverrides.Add(MaterialOverride);
						++OutMaterialOverrideCount;
					}
				}
			}

			LayoutSlots.Add(MoveTemp(Slot));
			++OutAssembledComponentCount;
		}
	}
	else
	{

	for (int32 Index = 0; Index < LayoutItems.Num(); ++Index)
	{
		const TSharedPtr<FJsonObject> LayoutObject = LayoutItems[Index].IsValid() ? LayoutItems[Index]->AsObject() : nullptr;
		if (!LayoutObject.IsValid())
		{
			continue;
		}

		const FString ObjectId = ReadStringField(LayoutObject, TEXT("id")).TrimStartAndEnd();
		UStaticMesh* const* StaticMeshPtr = ImportedMeshByObjectId.Find(ObjectId);
		if (!StaticMeshPtr || !*StaticMeshPtr)
		{
			++OutSkippedSlotCount;
			SummaryWarnings.Add(FString::Printf(TEXT("Object %s missing imported static mesh, skipped."), ObjectId.IsEmpty() ? *FString::Printf(TEXT("#%d"), Index + 1) : *ObjectId));
			continue;
		}

		const FString ObjectName = ReadStringField(LayoutObject, TEXT("name"), ObjectId.IsEmpty() ? FString::Printf(TEXT("Mesh_%d"), Index + 1) : ObjectId);
		const TSharedPtr<FJsonObject> PositionObject = ReadObjectField(LayoutObject, TEXT("position"));
		const TSharedPtr<FJsonObject> RotationObject = ReadObjectField(LayoutObject, TEXT("rotation"));
		const TSharedPtr<FJsonObject> ScaleObject = ReadObjectField(LayoutObject, TEXT("scale"));
		const TSharedPtr<FJsonObject> SizeObject = ReadObjectField(LayoutObject, TEXT("size"));
		const TSharedPtr<FJsonObject> OrientationFixObject = ReadObjectField(LayoutObject, TEXT("orientationFix"));
		const FRotator SceneRotation = SceneRotationToUnreal(RotationObject);
		const FRotator OrientationRotation = SceneRotationToUnreal(OrientationFixObject);
		const FQuat CombinedRotation = SceneRotation.Quaternion() * OrientationRotation.Quaternion();

		const FString BaseSlotId = SanitizeIdentifier(ObjectId.IsEmpty() ? ObjectName : ObjectId, TEXT("Slot"));
		const FString RawParentSlotId = ReadStringField(LayoutObject, TEXT("parentId")).TrimStartAndEnd();
		const FString ParentSlotId = RawParentSlotId.IsEmpty() ? FString() : SanitizeIdentifier(RawParentSlotId, TEXT("Slot"));
		const FString PreviewScaleMode = ReadStringField(LayoutObject, TEXT("previewScaleMode"));
		const FString FitMode = ReadStringField(LayoutObject, TEXT("fitMode"));
		const FString FillMode = ReadStringField(LayoutObject, TEXT("fillMode"));
		const int32 FillCount = FMath::Max(1, static_cast<int32>(ReadNumberField(LayoutObject, TEXT("fillCount"), 1.0)));
		const float FillAxisScale = static_cast<float>(ReadNumberField(LayoutObject, TEXT("fillAxisScale"), 1.0));
		const FVector PlaceholderSize = SceneSizeToUnreal(SizeObject);
		const FVector ScenePosition = FVector(
			ReadNumberField(PositionObject, TEXT("x"), 0.0),
			ReadNumberField(PositionObject, TEXT("y"), 0.0),
			ReadNumberField(PositionObject, TEXT("z"), 0.0));
		const FVector SceneScale = FVector(
			ReadNumberField(ScaleObject, TEXT("x"), 1.0),
			ReadNumberField(ScaleObject, TEXT("y"), 1.0),
			ReadNumberField(ScaleObject, TEXT("z"), 1.0));
		const FVector UnrealBaseLocation = ScenePointToUnreal(PositionObject);
		const FVector UnrealBaseScale = SceneScaleToUnreal(ScaleObject);
		const FVector PreviewScale = ComputePreviewAlignedScale(*StaticMeshPtr, PlaceholderSize, UnrealBaseScale, CombinedRotation.Rotator(), PreviewScaleMode, FitMode, FillMode, FillAxisScale, FillCount);
		const TArray<FString> RelationTags = ReadStringArrayField(LayoutObject, TEXT("relationTags"));
		FString Notes = ReadStringField(LayoutObject, TEXT("fitMessage"));
		if (Notes.IsEmpty())
		{
			Notes = ReadStringField(LayoutObject, TEXT("description"));
		}

		TArray<FDwebWorkflowMaterialOverride> MaterialOverrides;

		const TArray<TSharedPtr<FJsonValue>>* MaterialOverridesPtr = nullptr;
		if (LayoutObject->TryGetArrayField(TEXT("materialOverrides"), MaterialOverridesPtr) && MaterialOverridesPtr)
		{
			for (const TSharedPtr<FJsonValue>& OverrideValue : *MaterialOverridesPtr)
			{
				const TSharedPtr<FJsonObject> OverrideObject = OverrideValue.IsValid() ? OverrideValue->AsObject() : nullptr;
				if (!OverrideObject.IsValid())
				{
					continue;
				}

				FDwebWorkflowMaterialOverride MaterialOverride;
				MaterialOverride.MaterialSlotName = FName(*ReadStringField(OverrideObject, TEXT("materialSlotName")));
				MaterialOverride.MaterialAssetPath = ReadStringField(OverrideObject, TEXT("materialAssetPath"));
				MaterialOverride.bEnabled = !OverrideObject->HasField(TEXT("enabled")) || OverrideObject->GetBoolField(TEXT("enabled"));
				MaterialOverride.Source = ReadStringField(OverrideObject, TEXT("source"));
				if (!MaterialOverride.MaterialAssetPath.IsEmpty())
				{
					MaterialOverride.MaterialInterface = LoadObject<UMaterialInterface>(nullptr, *MaterialOverride.MaterialAssetPath);
					if (!MaterialOverride.MaterialInterface)
					{
						MaterialOverride.bEnabled = false;
					}
				}
				else
				{
					MaterialOverride.bEnabled = false;
				}
				if (MaterialOverride.bEnabled && MaterialOverride.MaterialInterface)
				{
					MaterialOverrides.Add(MaterialOverride);
					++OutMaterialOverrideCount;
				}
			}
		}

		const bool bExpandedFill = ResolveFillAxis(FillMode) != EDwebFillAxis::None && FillCount > 1;
		const int32 SlotInstanceCount = bExpandedFill ? FillCount : 1;
		for (int32 FillIndex = 0; FillIndex < SlotInstanceCount; ++FillIndex)
		{
			FDwebWorkflowLayoutSlot Slot;
			Slot.SlotId = bExpandedFill
				? SanitizeIdentifier(FString::Printf(TEXT("%s_%d"), *BaseSlotId, FillIndex + 1), TEXT("Slot"))
				: BaseSlotId;
			Slot.SourceSlotId = BaseSlotId;
			Slot.ParentSlotId = ParentSlotId;
			Slot.DisplayName = bExpandedFill
				? FString::Printf(TEXT("%s [%d/%d]"), *ObjectName, FillIndex + 1, SlotInstanceCount)
				: ObjectName;
			Slot.SourceObjectId = ObjectId;
			Slot.SourceObjectName = ObjectName;
			Slot.StaticMeshAsset = *StaticMeshPtr;
			Slot.StaticMeshAssetPath = ImportedAssetPathByObjectId.FindRef(ObjectId);
			Slot.SourceModelPath = ImportedSourcePathByObjectId.FindRef(ObjectId);
			Slot.SourceBindingType = PreviewScaleMode;
			Slot.SurfaceSemantics.Category = TEXT("unknown");
			Slot.SurfaceSemantics.Placement = ReadStringField(LayoutObject, TEXT("placement"));
			Slot.SurfaceSemantics.SupportSurface = ReadStringField(LayoutObject, TEXT("supportSurface"));
			Slot.SurfaceSemantics.MountType = ReadStringField(LayoutObject, TEXT("mountType"));
			Slot.SurfaceSemantics.WallRole = ReadStringField(LayoutObject, TEXT("wallRole"));
			Slot.SurfaceSemantics.Anchor = ReadStringField(LayoutObject, TEXT("anchor"));
			Slot.SurfaceSemantics.SemanticRole = ReadStringField(LayoutObject, TEXT("semanticRole"));
			Slot.ParentReference.Mode = ParentSlotId.IsEmpty() ? TEXT("root") : TEXT("parent-slot");
			Slot.ParentReference.TargetObjectId = ReadStringField(LayoutObject, TEXT("parentId"));
			Slot.ParentReference.TargetSlotId = ParentSlotId;
			Slot.ParentReference.ParentAnchor = TEXT("center");
			Slot.ParentReference.ChildAnchor = TEXT("center");
			Slot.ConstraintDiagnostics.ExportMode = ParentSlotId.IsEmpty() ? TEXT("root-relative") : TEXT("parent-relative");
			Slot.PlaceholderSize = PlaceholderSize;
			Slot.TransformData.ScenePosition = ScenePosition;
			Slot.TransformData.SceneRotation = SceneRotation;
			Slot.TransformData.SceneScale = SceneScale;
			Slot.TransformData.OrientationOffset = OrientationRotation;
			Slot.TransformData.RelativeTransform = FTransform(
				CombinedRotation,
				UnrealBaseLocation + ComputeFillCloneOffset(PlaceholderSize, FillMode, SlotInstanceCount, FillIndex),
				PreviewScale);
			Slot.TransformData.FitMode = FitMode;
			Slot.TransformData.FillMode = FillMode;
			Slot.TransformData.PreviewScaleMode = PreviewScaleMode;
			Slot.TransformData.FillCount = FillCount;
			Slot.TransformData.FillAxisScale = FillAxisScale;
			Slot.TransformData.FillCloneIndex = FillIndex;
			Slot.TransformData.FillCloneCount = SlotInstanceCount;
			Slot.TransformData.bFillClone = bExpandedFill;
			Slot.TransformData.bDerivedFromPreview = true;
			Slot.TransformData.SourceLayoutItemId = ObjectId;
			Slot.TransformData.ParentLayoutItemId = ReadStringField(LayoutObject, TEXT("parentId"));
			Slot.MaterialOverrides = MaterialOverrides;
			Slot.Tags = RelationTags;
			Slot.Notes = Notes;
			Slot.LastImportedAt = FDateTime::UtcNow().ToUnixTimestamp();
			Slot.bDerivedSlot = bExpandedFill && FillIndex > 0;
			LayoutSlots.Add(MoveTemp(Slot));
			++OutAssembledComponentCount;
		}
	}
	}

	LayoutDefaults->Modify();
	LayoutDefaults->LayoutSlots = MoveTemp(LayoutSlots);
	LayoutDefaults->ImportSummary.LastImportJobId = JobId;
	LayoutDefaults->ImportSummary.BlueprintAssetPath = BlueprintAssetPath;
	LayoutDefaults->ImportSummary.ModelsAssetPath = ModelsAssetPath;
	LayoutDefaults->ImportSummary.ActorBaseClass = ADwebWorkflowLayoutActorBase::StaticClass()->GetPathName();
	LayoutDefaults->ImportSummary.LayoutProtocolVersion = LayoutProtocolVersion;
	LayoutDefaults->ImportSummary.SlotCount = OutAssembledComponentCount;
	LayoutDefaults->ImportSummary.AppliedSlotCount = OutAssembledComponentCount;
	LayoutDefaults->ImportSummary.MaterialOverrideCount = OutMaterialOverrideCount;
	LayoutDefaults->ImportSummary.SkippedSlotCount = OutSkippedSlotCount;
	LayoutDefaults->ImportSummary.Warnings = MoveTemp(SummaryWarnings);
	LayoutDefaults->LastImportJobId = JobId;

	FlushAllPendingAsyncLoading();

	SyncBlueprintMeshListNodes(Blueprint, LayoutDefaults->LayoutSlots);

	Blueprint->Modify();
	Blueprint->MarkPackageDirty();
	if (UPackage* Package = Blueprint->GetOutermost())
	{
		Package->MarkPackageDirty();
	}
	FBlueprintEditorUtils::MarkBlueprintAsStructurallyModified(Blueprint);
	FBlueprintEditorUtils::MarkBlueprintAsModified(Blueprint);

	FlushAllPendingAsyncLoading();

	FKismetEditorUtilities::CompileBlueprint(Blueprint);

	FlushAllPendingAsyncLoading();

	return true;
}

bool FDwebWorkflowBridgeModule::SpawnSceneLayoutActors(UWorld* World, const FString& SceneName, const TArray<TSharedPtr<FJsonValue>>& LayoutItems, const TArray<TSharedPtr<FJsonValue>>& ModelBindings, int32& OutSpawnedActorCount, int32& OutPendingModelCount, FString& OutError)
{
	OutSpawnedActorCount = 0;
	OutPendingModelCount = 0;
	if (!World)
	{
		OutError = TEXT("Layout generation failed: no world available.") ;
		return false;
	}

	TMap<FString, TSharedPtr<FJsonObject>> BindingByObjectId;
	for (const TSharedPtr<FJsonValue>& BindingValue : ModelBindings)
	{
		const TSharedPtr<FJsonObject> BindingObject = BindingValue.IsValid() ? BindingValue->AsObject() : nullptr;
		if (!BindingObject.IsValid())
		{
			continue;
		}
		const FString ObjectId = ReadStringField(BindingObject, TEXT("objectId")).TrimStartAndEnd();
		const FString ModelUrl = ReadStringField(BindingObject, TEXT("modelUrl")).TrimStartAndEnd();
		const FString ModelAssetUrl = ReadStringField(BindingObject, TEXT("modelAssetUrl")).TrimStartAndEnd();
		if (!ObjectId.IsEmpty() && (!ModelUrl.IsEmpty() || !ModelAssetUrl.IsEmpty()))
		{
			BindingByObjectId.Add(ObjectId, BindingObject);
		}
	}

	UStaticMesh* CubeMesh = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
	const FName FolderPath(*FString::Printf(TEXT("Dweb/%s"), *SceneName));

	for (int32 Index = 0; Index < LayoutItems.Num(); ++Index)
	{
		const TSharedPtr<FJsonObject> ItemObject = LayoutItems[Index].IsValid() ? LayoutItems[Index]->AsObject() : nullptr;
		if (!ItemObject.IsValid())
		{
			continue;
		}

		const FString ObjectId = ReadStringField(ItemObject, TEXT("id")).TrimStartAndEnd();
		const FString ItemName = ReadStringField(ItemObject, TEXT("name"), ObjectId.IsEmpty() ? FString::Printf(TEXT("Item_%d"), Index + 1) : ObjectId).TrimStartAndEnd();
		const TSharedPtr<FJsonObject> SizeObject = ReadObjectField(ItemObject, TEXT("size"));
		const TSharedPtr<FJsonObject> PositionObject = ReadObjectField(ItemObject, TEXT("position"));
		const TSharedPtr<FJsonObject> ScaleObject = ReadObjectField(ItemObject, TEXT("scale"));
		const TSharedPtr<FJsonObject> RotationObject = ReadObjectField(ItemObject, TEXT("rotation"));

		const double Width = FMath::Max(0.05, ReadNumberField(SizeObject, TEXT("width"), 1.0));
		const double Height = FMath::Max(0.05, ReadNumberField(SizeObject, TEXT("height"), 1.0));
		const double Depth = FMath::Max(0.05, ReadNumberField(SizeObject, TEXT("depth"), 1.0));
		const double ScaleX = FMath::Max(0.01, ReadNumberField(ScaleObject, TEXT("x"), 1.0));
		const double ScaleY = FMath::Max(0.01, ReadNumberField(ScaleObject, TEXT("y"), 1.0));
		const double ScaleZ = FMath::Max(0.01, ReadNumberField(ScaleObject, TEXT("z"), 1.0));

		const FVector ActorLocation = ScenePointToUnreal(PositionObject, Height * ScaleY * 0.5);
		const FRotator ActorRotation = SceneRotationToUnreal(RotationObject);
		const FVector ActorScale(Width * ScaleX, Depth * ScaleZ, Height * ScaleY);

		FActorSpawnParameters SpawnParameters;
		SpawnParameters.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		AStaticMeshActor* Actor = World->SpawnActor<AStaticMeshActor>(AStaticMeshActor::StaticClass(), ActorLocation, ActorRotation, SpawnParameters);
		if (!Actor)
		{
			continue;
		}

		UStaticMeshComponent* MeshComponent = Actor->GetStaticMeshComponent();
		if (MeshComponent)
		{
			if (CubeMesh)
			{
				MeshComponent->SetStaticMesh(CubeMesh);
			}
			MeshComponent->SetMobility(EComponentMobility::Movable);
		}
		Actor->SetActorScale3D(ActorScale);
		Actor->Tags.Add(FName(TEXT("DwebLayoutItem")));
		if (!ObjectId.IsEmpty())
		{
			Actor->Tags.Add(FName(*FString::Printf(TEXT("DwebObject_%s"), *SanitizeFileName(ObjectId))));
		}

		bool bHasPendingModel = false;
		if (const TSharedPtr<FJsonObject>* BindingObject = BindingByObjectId.Find(ObjectId))
		{
			const FString ModelUrl = ReadStringField(*BindingObject, TEXT("modelUrl")).TrimStartAndEnd();
			const FString ModelAssetUrl = ReadStringField(*BindingObject, TEXT("modelAssetUrl")).TrimStartAndEnd();
			bHasPendingModel = !ModelUrl.IsEmpty() || !ModelAssetUrl.IsEmpty();
		}
		if (bHasPendingModel)
		{
			++OutPendingModelCount;
			Actor->Tags.Add(FName(TEXT("DwebModelPending")));
		}

#if WITH_EDITOR
		Actor->SetActorLabel(FString::Printf(TEXT("Dweb_%s_%s%s"), *SceneName, *SanitizeFileName(ItemName), bHasPendingModel ? TEXT("_ModelPending") : TEXT("")));
		Actor->SetFolderPath(FolderPath);
#endif
		++OutSpawnedActorCount;
	}

	return true;
}

bool FDwebWorkflowBridgeModule::SpawnLightingActors(UWorld* World, const FString& SceneName, const TSharedPtr<FJsonObject>& LightingPayload, AActor* AnchorActor, int32& OutSpawnedLightCount, FString& OutError)
{
	OutSpawnedLightCount = 0;
	OutError.Reset();
	if (!World || !LightingPayload.IsValid())
	{
		return true;
	}

	const FName FolderPath(*FString::Printf(TEXT("Dweb/%s"), *SceneName));
	const FTransform AnchorTransform = AnchorActor ? AnchorActor->GetActorTransform() : FTransform::Identity;
	auto AttachToAnchor = [&](AActor* SpawnedActor)
	{
		if (SpawnedActor && AnchorActor)
		{
			SpawnedActor->AttachToActor(AnchorActor, FAttachmentTransformRules::KeepWorldTransform);
		}
	};
	auto ToWorldLocation = [&](const TSharedPtr<FJsonObject>& ScenePointObject) -> FVector
	{
		const FVector LocalPoint = ScenePointToUnreal(ScenePointObject);
		return AnchorTransform.TransformPosition(LocalPoint);
	};
	auto ToWorldRotationFromScene = [&](const TSharedPtr<FJsonObject>& SceneRotationObject) -> FRotator
	{
		const FQuat LocalQuat = SceneRotationToUnreal(SceneRotationObject).Quaternion();
		return (AnchorTransform.GetRotation() * LocalQuat).Rotator();
	};
	auto SpawnSkyLight = [&](const FString& Label, double Intensity, const FString& ColorText) -> void
	{
		if (Intensity <= 0.001)
		{
			return;
		}
		FActorSpawnParameters SpawnParameters;
		SpawnParameters.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		ASkyLight* SkyLight = World->SpawnActor<ASkyLight>(ASkyLight::StaticClass(), AnchorTransform.GetLocation(), AnchorTransform.GetRotation().Rotator(), SpawnParameters);
		if (!SkyLight)
		{
			return;
		}
		if (USkyLightComponent* SkyComponent = SkyLight->GetLightComponent())
		{
			const double SkyIntensity = ComputeMappedLightIntensity(FindDwebLightMappingRule(TEXT("ambient")), Intensity);
			SkyComponent->SetIntensity(FMath::Max(0.02, SkyIntensity));
			SkyComponent->SetLightColor(ParseColorString(ColorText, FLinearColor::White));
		}
		SkyLight->Tags.Add(FName(TEXT("DwebLight")));
#if WITH_EDITOR
		SkyLight->SetActorLabel(Label);
		SkyLight->SetFolderPath(FolderPath);
#endif
		AttachToAnchor(SkyLight);
		++OutSpawnedLightCount;
	};

	const TSharedPtr<FJsonObject> AmbientLight = ReadObjectField(LightingPayload, TEXT("ambientLight"));
	const TSharedPtr<FJsonObject> HemisphereLight = ReadObjectField(LightingPayload, TEXT("hemisphereLight"));
	if (AmbientLight.IsValid())
	{
		SpawnSkyLight(FString::Printf(TEXT("Dweb_%s_Ambient"), *SceneName), ReadNumberField(AmbientLight, TEXT("intensity"), 0.0), ReadStringField(AmbientLight, TEXT("color"), TEXT("#ffffff")));
	}
	if (HemisphereLight.IsValid())
	{
		SpawnSkyLight(FString::Printf(TEXT("Dweb_%s_Hemisphere"), *SceneName), ReadNumberField(HemisphereLight, TEXT("intensity"), 0.0), ReadStringField(HemisphereLight, TEXT("skyColor"), TEXT("#ffffff")));
	}

	const TArray<TSharedPtr<FJsonValue>>* LightsArray = nullptr;
	if (!LightingPayload->TryGetArrayField(TEXT("lights"), LightsArray) || !LightsArray)
	{
		return true;
	}

	for (int32 Index = 0; Index < LightsArray->Num(); ++Index)
	{
		const TSharedPtr<FJsonObject> LightObject = (*LightsArray)[Index].IsValid() ? (*LightsArray)[Index]->AsObject() : nullptr;
		if (!LightObject.IsValid())
		{
			continue;
		}

		const FString Type = NormalizeDwebLightType(ReadStringField(LightObject, TEXT("type"), TEXT("point")));
		const FDwebLightMappingRule* MappingRule = FindDwebLightMappingRule(Type);
		const FString Name = ReadStringField(LightObject, TEXT("name"), FString::Printf(TEXT("Light_%d"), Index + 1)).TrimStartAndEnd();
		const FString Label = FString::Printf(TEXT("Dweb_%s_%s"), *SceneName, *SanitizeFileName(Name));
		const TSharedPtr<FJsonObject> PositionObject = ReadObjectField(LightObject, TEXT("position"));
		const TSharedPtr<FJsonObject> TargetObject = ReadObjectField(LightObject, TEXT("target"));
		const TSharedPtr<FJsonObject> RotationObject = ReadObjectField(LightObject, TEXT("rotation"));
		const FVector LightLocation = ToWorldLocation(PositionObject);
		const FVector TargetLocation = ToWorldLocation(TargetObject);
		const FVector LightDirection = (TargetLocation - LightLocation).GetSafeNormal();
		const FRotator LookAtRotation = LightDirection.IsNearlyZero() ? ToWorldRotationFromScene(RotationObject) : FRotationMatrix::MakeFromX(LightDirection).Rotator();
		const double SourceIntensity = FMath::Max(0.0, ReadNumberField(LightObject, TEXT("intensity"), 1.0));
		const double Intensity = ComputeMappedLightIntensity(MappingRule, SourceIntensity);
		const FString ColorText = ReadStringField(LightObject, TEXT("color"), TEXT("#ffffff"));
		const double AttenuationRadiusCm = ComputeMappedAttenuationCm(MappingRule, ReadNumberField(LightObject, TEXT("distance"), 0.0));

		FActorSpawnParameters SpawnParameters;
		SpawnParameters.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

		if (Type == TEXT("directional"))
		{
			ADirectionalLight* LightActor = World->SpawnActor<ADirectionalLight>(ADirectionalLight::StaticClass(), LightLocation, LookAtRotation, SpawnParameters);
			if (!LightActor)
			{
				continue;
			}
			if (ULightComponent* LightComponent = LightActor->GetLightComponent())
			{
				LightComponent->SetIntensity(FMath::Max(0.08, Intensity));
				LightComponent->SetLightColor(ParseColorString(ColorText, FLinearColor::White));
			}
#if WITH_EDITOR
			LightActor->SetActorLabel(Label);
			LightActor->SetFolderPath(FolderPath);
#endif
			LightActor->Tags.Add(FName(TEXT("DwebLight")));
			AttachToAnchor(LightActor);
			++OutSpawnedLightCount;
			continue;
		}

		if (Type == TEXT("spot"))
		{
			ASpotLight* LightActor = World->SpawnActor<ASpotLight>(ASpotLight::StaticClass(), LightLocation, LookAtRotation, SpawnParameters);
			if (!LightActor)
			{
				continue;
			}
			if (USpotLightComponent* LightComponent = LightActor->SpotLightComponent)
			{
				LightComponent->SetIntensity(Intensity);
				LightComponent->SetLightColor(ParseColorString(ColorText, FLinearColor::White));
				LightComponent->SetAttenuationRadius(AttenuationRadiusCm);
				LightComponent->SetOuterConeAngle(FMath::Clamp(FMath::RadiansToDegrees(ReadNumberField(LightObject, TEXT("angle"), 0.75)), 15.0, 85.0));
			}
#if WITH_EDITOR
			LightActor->SetActorLabel(Label);
			LightActor->SetFolderPath(FolderPath);
#endif
			LightActor->Tags.Add(FName(TEXT("DwebLight")));
			AttachToAnchor(LightActor);
			++OutSpawnedLightCount;
			continue;
		}

		if (Type == TEXT("rect-area"))
		{
			ARectLight* LightActor = World->SpawnActor<ARectLight>(ARectLight::StaticClass(), LightLocation, LookAtRotation, SpawnParameters);
			if (!LightActor)
			{
				continue;
			}
			if (URectLightComponent* LightComponent = LightActor->RectLightComponent)
			{
				const double WidthCm = FMath::Clamp(ReadNumberField(LightObject, TEXT("width"), MappingRule ? MappingRule->DefaultWidthCm / 100.0 : 1.2) * 100.0, 5.0, 1000.0);
				const double HeightCm = FMath::Clamp(ReadNumberField(LightObject, TEXT("height"), MappingRule ? MappingRule->DefaultHeightCm / 100.0 : 0.4) * 100.0, 5.0, 1000.0);
				LightComponent->SetIntensity(Intensity);
				LightComponent->SetLightColor(ParseColorString(ColorText, FLinearColor::White));
				LightComponent->SetAttenuationRadius(AttenuationRadiusCm);
				LightComponent->SetSourceWidth(static_cast<float>(WidthCm));
				LightComponent->SetSourceHeight(static_cast<float>(HeightCm));
			}
#if WITH_EDITOR
			LightActor->SetActorLabel(Label);
			LightActor->SetFolderPath(FolderPath);
#endif
			LightActor->Tags.Add(FName(TEXT("DwebLight")));
			AttachToAnchor(LightActor);
			++OutSpawnedLightCount;
			continue;
		}

		APointLight* LightActor = World->SpawnActor<APointLight>(APointLight::StaticClass(), LightLocation, LookAtRotation, SpawnParameters);
		if (!LightActor)
		{
			continue;
		}
		if (UPointLightComponent* LightComponent = LightActor->PointLightComponent)
		{
			LightComponent->SetIntensity(Intensity);
			LightComponent->SetLightColor(ParseColorString(ColorText, FLinearColor::White));
			LightComponent->SetAttenuationRadius(AttenuationRadiusCm);
		}
#if WITH_EDITOR
		LightActor->SetActorLabel(Label);
		LightActor->SetFolderPath(FolderPath);
#endif
		LightActor->Tags.Add(FName(TEXT("DwebLight")));
		AttachToAnchor(LightActor);
		++OutSpawnedLightCount;
	}

	return true;
}

void FDwebWorkflowBridgeModule::RefreshSceneActorOptions()
{
	SceneActorOptions.Reset();

	UWorld* World = GetEditorWorld();
	if (World)
	{
		for (TActorIterator<AActor> It(World); It; ++It)
		{
			AActor* Actor = *It;
			if (!IsValid(Actor))
			{
				continue;
			}
			SceneActorOptions.Add(MakeShared<FString>(Actor->GetPathName()));
		}
	}

	SceneActorOptions.Sort([](const TSharedPtr<FString>& A, const TSharedPtr<FString>& B)
	{
		const FString Left = A.IsValid() ? *A : FString();
		const FString Right = B.IsValid() ? *B : FString();
		return Left < Right;
	});

	TSharedPtr<FString> SelectedOption;
	for (const TSharedPtr<FString>& Option : SceneActorOptions)
	{
		if (Option.IsValid() && Option->Equals(SelectedSceneActorPath, ESearchCase::CaseSensitive))
		{
			SelectedOption = Option;
			break;
		}
	}

	if (!SelectedOption.IsValid() && SceneActorOptions.Num() > 0)
	{
		SelectedOption = SceneActorOptions[0];
		SelectedSceneActorPath = *SelectedOption;
	}

	if (!SelectedOption.IsValid())
	{
		SelectedSceneActorPath.Reset();
	}
}

AActor* FDwebWorkflowBridgeModule::ResolveSelectedSceneActor() const
{
	const FString TargetPath = SelectedSceneActorPath.TrimStartAndEnd();
	if (TargetPath.IsEmpty())
	{
		return nullptr;
	}

	UWorld* World = GetEditorWorld();
	if (!World)
	{
		return nullptr;
	}

	for (TActorIterator<AActor> It(World); It; ++It)
	{
		AActor* Actor = *It;
		if (!IsValid(Actor))
		{
			continue;
		}
		if (Actor->GetPathName().Equals(TargetPath, ESearchCase::CaseSensitive))
		{
			return Actor;
		}
	}

	return nullptr;
}

AActor* FDwebWorkflowBridgeModule::AutoResolveSceneActor() const
{
	UWorld* World = GetEditorWorld();
	if (!World)
	{
		return nullptr;
	}

	AActor* FirstLayoutActor = nullptr;
	for (TActorIterator<ADwebWorkflowLayoutActorBase> It(World); It; ++It)
	{
		AActor* Actor = *It;
		if (IsValid(Actor))
		{
			FirstLayoutActor = Actor;
			break;
		}
	}
	if (FirstLayoutActor)
	{
		return FirstLayoutActor;
	}

	return ResolveSelectedSceneActor();
}

bool FDwebWorkflowBridgeModule::HandleHeartbeatTick(float DeltaTime)
{
	if (!SessionId.IsEmpty())
	{
		SendHeartbeat();
	}
	else if (bAutoConnectOnStartup && !bHeartbeatInFlight && !bPollInFlight)
	{
		static double LastAutoConnectAttempt = 0.0;
		const double Now = FPlatformTime::Seconds();
		if (Now - LastAutoConnectAttempt > 3.0)
		{
			LastAutoConnectAttempt = Now;
			LoadConnectionConfig();
			RegisterSession();
		}
	}
	return true;
}

void FDwebWorkflowBridgeModule::ApplyLayoutComponentsToSelectedActors()
{
	UWorld* World = GetEditorWorld();
	if (!World)
	{
		UE_LOG(LogTemp, Warning, TEXT("DwebWorkflow.ApplyLayoutComponents: No editor world available."));
		return;
	}

#if WITH_EDITOR
	USelection* SelectedActors = GEditor->GetSelectedActors();
	if (!SelectedActors || SelectedActors->Num() == 0)
	{
		UE_LOG(LogTemp, Warning, TEXT("DwebWorkflow.ApplyLayoutComponents: No selected actors."));
		return;
	}

	int32 ProcessedActorCount = 0;
	int32 AddedComponentCount = 0;

	for (FSelectionIterator It(*SelectedActors); It; ++It)
	{
		AActor* SelectedActor = Cast<AActor>(*It);
		if (!SelectedActor || !IsValid(SelectedActor))
		{
			continue;
		}

		ADwebWorkflowLayoutActorBase* LayoutActor = Cast<ADwebWorkflowLayoutActorBase>(SelectedActor);
		if (!LayoutActor || LayoutActor->HasAnyFlags(RF_ClassDefaultObject))
		{
			UE_LOG(LogTemp, Warning, TEXT("DwebWorkflow.ApplyLayoutComponents: Selected actor is not a valid DwebWorkflowLayoutActorBase."));
			continue;
		}

		if (LayoutActor->LayoutSlots.Num() == 0)
		{
			UE_LOG(LogTemp, Warning, TEXT("DwebWorkflow.ApplyLayoutComponents: Actor %s has no layout slots."), *LayoutActor->GetName());
			continue;
		}

		FScopedTransaction Transaction(FText::FromString(TEXT("Apply Dweb Layout Components")));
		LayoutActor->Modify();

		USceneComponent* ActorRoot = LayoutActor->GetRootComponent();
		if (!ActorRoot)
		{
			ActorRoot = NewObject<USceneComponent>(LayoutActor, USceneComponent::GetDefaultSceneRootVariableName(), RF_Transactional);
			ActorRoot->SetMobility(EComponentMobility::Movable);
			ActorRoot->RegisterComponent();
			LayoutActor->SetRootComponent(ActorRoot);
			LayoutActor->AddInstanceComponent(ActorRoot);
		}
		ActorRoot->SetMobility(EComponentMobility::Movable);

		TMap<FString, FTransform> SlotRelativeTransforms;
		SlotRelativeTransforms.Reserve(LayoutActor->LayoutSlots.Num());

		for (const FDwebWorkflowLayoutSlot& Slot : LayoutActor->LayoutSlots)
		{
			if (!Slot.bEnabled)
			{
				continue;
			}

			FTransform ParentRelativeTransform = FTransform::Identity;
			FString ParentId = Slot.ParentSlotId.TrimStartAndEnd();
			if (!ParentId.IsEmpty())
			{
				if (const FTransform* FoundParent = SlotRelativeTransforms.Find(ParentId))
				{
					ParentRelativeTransform = *FoundParent;
				}
			}

			FTransform SlotTransform;
			bool bHasParent = !ParentId.IsEmpty();
			if (bHasParent)
			{
				SlotTransform = ParentRelativeTransform * Slot.TransformData.RelativeTransform;
			}
			else
			{
				SlotTransform = Slot.TransformData.WorldTransform;
			}
			SlotRelativeTransforms.Add(Slot.SlotId, SlotTransform);
		}

		for (int32 SlotIndex = 0; SlotIndex < LayoutActor->LayoutSlots.Num(); ++SlotIndex)
		{
			const FDwebWorkflowLayoutSlot& Slot = LayoutActor->LayoutSlots[SlotIndex];
			if (!Slot.bEnabled || !Slot.StaticMeshAsset)
			{
				continue;
			}

			FTransform FinalTransform;
			FString ParentId = Slot.ParentSlotId.TrimStartAndEnd();
			if (ParentId.IsEmpty())
			{
				FinalTransform = Slot.MeshRelativeTransform;
			}
			else
			{
				const FTransform* SlotTransform = SlotRelativeTransforms.Find(Slot.SlotId);
				FinalTransform = (SlotTransform ? *SlotTransform : FTransform::Identity) * Slot.MeshRelativeTransform;
			}

			UE_LOG(LogTemp, Log, TEXT("DwebWorkflow.ApplyLayoutComponents: Slot=%s Parent=%s Loc=(%.1f,%.1f,%.1f) Rot=(%.1f,%.1f,%.1f) Scale=(%.2f,%.2f,%.2f)"),
				*Slot.SlotId,
				*ParentId,
				FinalTransform.GetLocation().X, FinalTransform.GetLocation().Y, FinalTransform.GetLocation().Z,
				FinalTransform.Rotator().Pitch, FinalTransform.Rotator().Yaw, FinalTransform.Rotator().Roll,
				FinalTransform.GetScale3D().X, FinalTransform.GetScale3D().Y, FinalTransform.GetScale3D().Z);

			FString BaseName = Slot.SlotId.TrimStartAndEnd();
			if (BaseName.IsEmpty())
			{
				BaseName = Slot.DisplayName.TrimStartAndEnd();
			}
			if (BaseName.IsEmpty())
			{
				BaseName = FString::Printf(TEXT("Slot_%d"), SlotIndex + 1);
			}
			for (TCHAR& Ch : BaseName)
			{
				if (FChar::IsWhitespace(Ch) || Ch == TEXT('-') || Ch == TEXT('/') || Ch == TEXT('\\') || Ch == TEXT('.') || Ch == TEXT(',') || Ch == TEXT(':') || Ch == TEXT(';'))
				{
					Ch = TEXT('_');
				}
			}
			if (BaseName.Len() > 60)
			{
				BaseName = BaseName.Left(60);
			}

			FName ComponentName = MakeUniqueObjectName(LayoutActor, UStaticMeshComponent::StaticClass(), FName(*FString::Printf(TEXT("SM_%s"), *BaseName)));

			UStaticMeshComponent* NewMeshComp = NewObject<UStaticMeshComponent>(
				LayoutActor,
				UStaticMeshComponent::StaticClass(),
				ComponentName,
				RF_Transactional
			);

			if (!NewMeshComp)
			{
				UE_LOG(LogTemp, Warning, TEXT("DwebWorkflow.ApplyLayoutComponents: Failed to create StaticMeshComponent for slot %s."), *BaseName);
				continue;
			}

			NewMeshComp->SetMobility(EComponentMobility::Movable);
			NewMeshComp->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
			NewMeshComp->SetGenerateOverlapEvents(true);
			NewMeshComp->SetStaticMesh(Slot.StaticMeshAsset);
			NewMeshComp->SetRelativeTransform(FinalTransform);

			for (const FDwebWorkflowMaterialOverride& MaterialOverride : Slot.MaterialOverrides)
			{
				if (!MaterialOverride.bEnabled || !MaterialOverride.MaterialInterface)
				{
					continue;
				}
				const int32 MaterialIndex = !MaterialOverride.MaterialSlotName.IsNone()
					? NewMeshComp->GetMaterialIndex(MaterialOverride.MaterialSlotName)
					: 0;
				if (MaterialIndex >= 0)
				{
					NewMeshComp->SetMaterial(MaterialIndex, MaterialOverride.MaterialInterface);
				}
			}

			NewMeshComp->AttachToComponent(ActorRoot, FAttachmentTransformRules::KeepRelativeTransform);
			LayoutActor->AddInstanceComponent(NewMeshComp);
			NewMeshComp->RegisterComponent();
			NewMeshComp->SetRelativeTransform(FinalTransform);
			NewMeshComp->UpdateComponentToWorld();

			++AddedComponentCount;
		}

		GEditor->BroadcastLevelActorListChanged();
		GEditor->RedrawLevelEditingViewports(true);
		GEditor->SelectActor(LayoutActor, true, true);

		++ProcessedActorCount;
		UE_LOG(LogTemp, Display, TEXT("DwebWorkflow.ApplyLayoutComponents: Added %d components to actor %s."), AddedComponentCount, *LayoutActor->GetName());
	}

	UE_LOG(LogTemp, Display, TEXT("DwebWorkflow.ApplyLayoutComponents: Processed %d actors, added %d components total."), ProcessedActorCount, AddedComponentCount);
#else
	UE_LOG(LogTemp, Warning, TEXT("DwebWorkflow.ApplyLayoutComponents: Not in editor mode."));
#endif
}

void FDwebWorkflowBridgeModule::AppendLog(const FString& Line)
{
	if (LatestLog.IsEmpty())
	{
		LatestLog = Line;
		return;
	}
	LatestLog = FString::Printf(TEXT("%s\n%s"), *Line, *LatestLog);
}

void FDwebWorkflowBridgeModule::UpdateConnectionStatus(const FString& InStatus)
{
	ConnectionStatus = InStatus;
}

FString FDwebWorkflowBridgeModule::BuildApiUrl(const FString& Path) const
{
	FString Base = BackendUrl;
	Base.TrimStartAndEndInline();
	while (Base.EndsWith(TEXT("/")))
	{
		Base.LeftChopInline(1);
	}
	if (Path.StartsWith(TEXT("/")))
	{
		return Base + Path;
	}
	return Base + TEXT("/") + Path;
}

bool FDwebWorkflowBridgeModule::ParseJson(const FString& Text, TSharedPtr<FJsonObject>& OutObject) const
{
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
	return FJsonSerializer::Deserialize(Reader, OutObject) && OutObject.IsValid();
}

FString FDwebWorkflowBridgeModule::SanitizeFileName(const FString& InValue) const
{
	const FString Trimmed = InValue.TrimStartAndEnd();
	return FPaths::MakeValidFileName(Trimmed.IsEmpty() ? TEXT("DwebScene") : Trimmed, TCHAR('_'));
}


void FDwebWorkflowBridgeModule::GetConnectionConfigPaths(TArray<FString>& OutPaths) const
{
	OutPaths.Reset();

	const FString ProjectPluginConfig = FPaths::ConvertRelativePathToFull(FPaths::ProjectPluginsDir() / TEXT("DwebWorkflowBridge") / TEXT("dvstudio-unreal-bridge.json"));
	OutPaths.Add(ProjectPluginConfig);

	const FString ProjectSavedConfig = FPaths::ConvertRelativePathToFull(FPaths::ProjectSavedDir() / TEXT("dvstudio-unreal-bridge.json"));
	OutPaths.Add(ProjectSavedConfig);

	const FString UserHome = FPlatformProcess::UserHomeDir();
	if (!UserHome.IsEmpty())
	{
#if PLATFORM_WINDOWS
		OutPaths.Add(FPaths::Combine(UserHome, TEXT("AppData"), TEXT("Roaming"), TEXT("DVStudio"), TEXT("dvstudio-unreal-bridge.json")));
		OutPaths.Add(FPaths::Combine(UserHome, TEXT(".dvstudio"), TEXT("dvstudio-unreal-bridge.json")));
#elif PLATFORM_MAC
		OutPaths.Add(FPaths::Combine(UserHome, TEXT("Library"), TEXT("Application Support"), TEXT("DVStudio"), TEXT("dvstudio-unreal-bridge.json")));
		OutPaths.Add(FPaths::Combine(UserHome, TEXT(".dvstudio"), TEXT("dvstudio-unreal-bridge.json")));
#else
		OutPaths.Add(FPaths::Combine(UserHome, TEXT(".config"), TEXT("dvstudio"), TEXT("dvstudio-unreal-bridge.json")));
		OutPaths.Add(FPaths::Combine(UserHome, TEXT(".dvstudio"), TEXT("dvstudio-unreal-bridge.json")));
#endif
	}
}

bool FDwebWorkflowBridgeModule::LoadConnectionConfig()
{
	TArray<FString> ConfigPaths;
	GetConnectionConfigPaths(ConfigPaths);

	for (const FString& ConfigPath : ConfigPaths)
	{
		if (ConfigPath.IsEmpty() || !FPaths::FileExists(ConfigPath))
		{
			continue;
		}

		FString JsonString;
		if (!FFileHelper::LoadFileToString(JsonString, *ConfigPath))
		{
			continue;
		}

		TSharedPtr<FJsonObject> ConfigObject;
		const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);
		if (!FJsonSerializer::Deserialize(Reader, ConfigObject) || !ConfigObject.IsValid())
		{
			continue;
		}

		FString NewBackendUrl = ReadStringField(ConfigObject, TEXT("backendUrl"));
		if (NewBackendUrl.IsEmpty())
		{
			double PortValue = 0.0;
			const FString Host = ReadStringField(ConfigObject, TEXT("host"), TEXT("127.0.0.1"));
			if (ConfigObject->TryGetNumberField(TEXT("port"), PortValue) && PortValue > 0.0)
			{
				const int32 Port = static_cast<int32>(PortValue);
				NewBackendUrl = FString::Printf(TEXT("http://%s:%d"), *Host, Port);
			}
		}

		if (!NewBackendUrl.IsEmpty())
		{
			BackendUrl = NewBackendUrl;
			AppendLog(FString::Printf(TEXT("Loaded connection config from: %s"), *ConfigPath));
			return true;
		}
	}

	return false;
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FDwebWorkflowBridgeModule, DwebWorkflowBridge)