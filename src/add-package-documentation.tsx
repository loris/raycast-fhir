import { ActionPanel, Action, List, showToast, Toast, Color } from "@raycast/api";
import { usePromise, useFetch } from "@raycast/utils";
import { useState } from "react";
import {
  getSearchPackagesUrl,
  getSearchPackagesOptions,
  parseSearchPackagesResponse,
  FHIRPackage,
} from "./utils/fhir-registry-api";
import { addPackage, getSavedPackages, SavedPackage } from "./utils/storage";

export default function AddPackageDocumentation() {
  const [searchText, setSearchText] = useState("");
  const [savedPackages, setSavedPackages] = useState<SavedPackage[]>([]);

  const shouldSearch = searchText.trim().length > 0;

  // Debug logging
  console.log("DEBUG - shouldSearch:", shouldSearch);
  console.log("DEBUG - searchText:", searchText);

  if (shouldSearch) {
    const url = getSearchPackagesUrl();
    const options = getSearchPackagesOptions(searchText);
    console.log("DEBUG - URL:", url);
    console.log("DEBUG - Options:", JSON.stringify(options, null, 2));
  }

  const {
    data: searchData,
    isLoading,
    error,
  } = useFetch(shouldSearch ? getSearchPackagesUrl() : undefined, {
    ...(shouldSearch ? getSearchPackagesOptions(searchText) : {}),
    keepPreviousData: true,
    execute: shouldSearch,
  });

  console.log("DEBUG - useFetch result:", {
    hasData: !!searchData,
    isLoading,
    error: error?.message || error,
    searchDataType: typeof searchData,
  });

  if (searchData) {
    console.log("DEBUG - Raw search data:", searchData);
  }

  const packages = searchData ? parseSearchPackagesResponse(searchData) : [];
  console.log("DEBUG - Parsed packages count:", packages.length);

  usePromise(getSavedPackages, [], {
    onData: setSavedPackages,
  });

  const handleAddPackage = async (pkg: FHIRPackage) => {
    try {
      await showToast({
        style: Toast.Style.Animated,
        title: "Adding package...",
      });

      await addPackage({
        id: pkg.id,
        name: pkg.name,
        title: pkg.title,
        version: pkg.version,
        description: pkg.description,
        canonical: pkg.canonical,
        url: pkg.url,
        publisher: pkg.publisher,
        author: pkg.author,
        fhirMajorVersion: pkg.fhirMajorVersion,
      });

      // Update local state
      const updatedPackages = await getSavedPackages();
      setSavedPackages(updatedPackages);

      await showToast({
        style: Toast.Style.Success,
        title: "Package added successfully",
        message: `${pkg.title} has been added to your documentation packages`,
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to add package",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const isPackageAlreadyAdded = (packageId: string) => {
    return savedPackages.some((pkg) => pkg.id === packageId);
  };

  const getFhirVersionBadge = (versions: number[]) => {
    if (versions.length === 0) return null;
    return versions.map((v) => `R${v}`).join(", ");
  };

  const getPackageTypeColor = (name: string) => {
    if (name.includes("hl7.fhir") && name.includes("core")) {
      return Color.Blue;
    }
    return Color.Green;
  };

  if (error) {
    return (
      <List searchBarPlaceholder="Search FHIR packages...">
        <List.EmptyView icon="⚠️" title="Search Error" description={error.message} />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search FHIR packages..."
      throttle
    >
      {!searchText.trim() ? (
        <List.EmptyView
          icon="🔍"
          title="Search for FHIR Packages"
          description="Enter a search term to find FHIR implementation guides and packages"
        />
      ) : packages?.length === 0 ? (
        <List.EmptyView icon="📭" title="No packages found" description="Try adjusting your search terms" />
      ) : (
        packages?.map((pkg) => (
          <List.Item
            key={pkg.id}
            title={pkg.title}
            subtitle={pkg.name}
            accessories={[
              { text: getFhirVersionBadge(pkg.fhirMajorVersion) },
              { text: pkg.version },
              ...(isPackageAlreadyAdded(pkg.id) ? [{ icon: "✓", tooltip: "Already added" }] : []),
            ]}
            detail={
              <List.Item.Detail
                markdown={`### ${pkg.title}\n\n${pkg.description}`}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.TagList title="Package Name">
                      <List.Item.Detail.Metadata.TagList.Item text={pkg.name} color={getPackageTypeColor(pkg.name)} />
                    </List.Item.Detail.Metadata.TagList>

                    <List.Item.Detail.Metadata.TagList title="Version">
                      <List.Item.Detail.Metadata.TagList.Item text={pkg.version} />
                    </List.Item.Detail.Metadata.TagList>

                    {pkg.fhirMajorVersion.length > 0 && (
                      <List.Item.Detail.Metadata.TagList title="FHIR Version">
                        {pkg.fhirMajorVersion.map((version) => (
                          <List.Item.Detail.Metadata.TagList.Item
                            key={version}
                            text={`R${version}`}
                            color={Color.Blue}
                          />
                        ))}
                      </List.Item.Detail.Metadata.TagList>
                    )}

                    <List.Item.Detail.Metadata.Separator />

                    <List.Item.Detail.Metadata.Link title="Canonical URL" target={pkg.canonical} text={pkg.canonical} />

                    <List.Item.Detail.Metadata.Link title="Package URL" target={pkg.url} text={pkg.url} />

                    {pkg.publisher && <List.Item.Detail.Metadata.Label title="Publisher" text={pkg.publisher} />}

                    {pkg.author && <List.Item.Detail.Metadata.Label title="Author" text={pkg.author} />}

                    <List.Item.Detail.Metadata.Label title="Downloads" text={pkg.totalDownloads.toLocaleString()} />

                    <List.Item.Detail.Metadata.Label title="Published" text={new Date(pkg.date).toLocaleDateString()} />
                  </List.Item.Detail.Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  <Action
                    title="Add Package"
                    icon="+"
                    onAction={() => handleAddPackage(pkg)}
                    shortcut={{ modifiers: ["cmd"], key: "enter" }}
                  />
                  <Action.OpenInBrowser title="Open Package URL" url={pkg.url} />
                  <Action.OpenInBrowser title="Open Canonical URL" url={pkg.canonical} />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action.CopyToClipboard title="Copy Package ID" content={pkg.id} />
                  <Action.CopyToClipboard title="Copy Package Name" content={pkg.name} />
                  <Action.CopyToClipboard title="Copy Canonical URL" content={pkg.canonical} />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
