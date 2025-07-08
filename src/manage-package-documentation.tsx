import { ActionPanel, Action, List, showToast, Toast, Color, confirmAlert, Alert } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { getSavedPackages, removePackage, SavedPackage, initializeDefaultPackages } from "./utils/storage";
import SearchPackages from "./search-packages";

export default function ManagePackageDocumentation() {
  const [packages, setPackages] = useState<SavedPackage[]>([]);

  const { isLoading, revalidate } = usePromise(
    async () => {
      // Initialize default packages if none exist
      await initializeDefaultPackages();
      return await getSavedPackages();
    },
    [],
    {
      onData: setPackages,
    },
  );

  const handleRemovePackage = async (pkg: SavedPackage) => {
    const confirmed = await confirmAlert({
      title: "Remove Package",
      message: `Are you sure you want to remove "${pkg.title}" from your documentation packages?`,
      primaryAction: {
        title: "Remove",
        style: Alert.ActionStyle.Destructive,
      },
      dismissAction: {
        title: "Cancel",
      },
    });

    if (!confirmed) return;

    try {
      await showToast({
        style: Toast.Style.Animated,
        title: "Removing package...",
      });

      await removePackage(pkg.id);
      await revalidate();

      await showToast({
        style: Toast.Style.Success,
        title: "Package removed",
        message: `${pkg.title} has been removed from your documentation packages`,
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to remove package",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
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

  const isDefaultPackage = (packageId: string) => {
    return packageId.includes("hl7.fhir") && packageId.includes("core");
  };

  if (packages.length === 0 && !isLoading) {
    return (
      <List>
        <List.EmptyView
          icon="📭"
          title="No packages configured"
          description="Add FHIR packages to get started"
          actions={
            <ActionPanel>
              <Action.Push title="Add Package" icon="+" target={<SearchPackages />} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List isLoading={isLoading} isShowingDetail>
      {packages
        .sort((a, b) => a.order - b.order)
        .map((pkg) => (
          <List.Item
            key={pkg.id}
            title={pkg.title}
            subtitle={pkg.name}
            accessories={[
              { text: getFhirVersionBadge(pkg.fhirMajorVersion) },
              { text: pkg.version },
              ...(isDefaultPackage(pkg.id) ? [{ icon: "⭐", tooltip: "Default package" }] : []),
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

                    <List.Item.Detail.Metadata.Label
                      title="Added"
                      text={new Date(pkg.dateAdded).toLocaleDateString()}
                    />

                    <List.Item.Detail.Metadata.Label title="Order" text={`${pkg.order + 1}`} />
                  </List.Item.Detail.Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  <Action.Push
                    title="Add Package"
                    icon="+"
                    target={<SearchPackages />}
                    shortcut={{ modifiers: ["cmd"], key: "n" }}
                  />
                  <Action.OpenInBrowser title="Open Package URL" url={pkg.url} />
                  <Action.OpenInBrowser title="Open Canonical URL" url={pkg.canonical} />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action
                    title="Remove Package"
                    icon="🗑"
                    style={Action.Style.Destructive}
                    onAction={() => handleRemovePackage(pkg)}
                    shortcut={{ modifiers: ["cmd"], key: "backspace" }}
                  />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action.CopyToClipboard title="Copy Package ID" content={pkg.id} />
                  <Action.CopyToClipboard title="Copy Package Name" content={pkg.name} />
                  <Action.CopyToClipboard title="Copy Canonical URL" content={pkg.canonical} />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        ))}
    </List>
  );
}
