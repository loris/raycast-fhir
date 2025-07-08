import { ActionPanel, Action, List, showToast, Toast, Color, Icon } from "@raycast/api";
import { useFetch } from "@raycast/utils";
import { useState } from "react";
import {
  getSearchPackagesUrl,
  getSearchPackagesOptions,
  parseSearchPackagesResponse,
  FHIRPackage,
} from "./utils/fhir-registry-api";
import { addPackage } from "./utils/storage";

export default function AddPackageDocumentation() {
  const [searchText, setSearchText] = useState("");

  const shouldSearch = searchText.trim().length > 0;

  const {
    data: searchData,
    isLoading,
    error,
  } = useFetch(shouldSearch ? getSearchPackagesUrl() : "", {
    ...(shouldSearch ? getSearchPackagesOptions(searchText) : {}),
    keepPreviousData: true,
    execute: shouldSearch,
  });

  const packages = searchData ? parseSearchPackagesResponse(searchData) : [];

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

      await showToast({
        style: Toast.Style.Success,
        title: "Package added successfully",
        message: `${pkg.name} has been added to your documentation packages`,
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to add package",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
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
        <List.EmptyView icon={Icon.ExclamationMark} title="Search Error" description={error.message} />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search FHIR packages..."
      throttle
      isShowingDetail
    >
      {!searchText.trim() ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="Search for FHIR Packages"
          description="Enter a search term to find FHIR implementation guides and packages"
        />
      ) : packages?.length === 0 ? (
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="No Packages Found"
          description="Try adjusting your search terms"
        />
      ) : (
        packages?.map((pkg) => (
          <List.Item
            key={pkg.id}
            title={pkg.name}
            subtitle={pkg.title}
            detail={
              <List.Item.Detail
                {...(pkg.description && { markdown: `### ${pkg.title || pkg.name || pkg.id}\n\n${pkg.description}` })}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.TagList title="Name">
                      <List.Item.Detail.Metadata.TagList.Item text={pkg.name} color={getPackageTypeColor(pkg.name)} />
                    </List.Item.Detail.Metadata.TagList>

                    {pkg.title && <List.Item.Detail.Metadata.Label title="Title" text={pkg.title} />}

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

                    <List.Item.Detail.Metadata.Link title="URL" target={pkg.url} text={pkg.url} />

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
                  <Action.OpenInBrowser title="Open in Browser" url={pkg.url} />
                  <Action title="Add Package" icon={Icon.Plus} onAction={() => handleAddPackage(pkg)} />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action.CopyToClipboard title="Copy ID" content={pkg.id} />
                  <Action.CopyToClipboard title="Copy Name" content={pkg.name} />
                  <Action.CopyToClipboard title="Copy URL" content={pkg.url} />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
