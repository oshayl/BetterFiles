/**
 * Empty, error and offline states (roadmap section 10.3 and 25).
 *
 * Every state says what happened and offers the next action, rather than just
 * reporting emptiness.
 */
import type { ReactElement, ReactNode } from 'react';
import { FolderIcon, OfflineIcon, SearchIcon, WarningIcon } from '../icons';
import { Pressable } from '../controls/Pressable';

interface StateProps {
  readonly title: string;
  readonly detail?: string;
  readonly icon?: ReactNode;
  readonly action?: { readonly label: string; readonly onClick: () => void };
}

export function StateMessage({ title, detail, icon, action }: StateProps): ReactElement {
  return (
    <div className="state">
      {icon && <div className="state__icon">{icon}</div>}
      <div className="state__title">{title}</div>
      {detail && <div className="state__detail">{detail}</div>}
      {action && (
        <Pressable className="button state__action" onClick={action.onClick}>
          {action.label}
        </Pressable>
      )}
    </div>
  );
}

export function NoLibrariesState({ onAddFolder }: { onAddFolder: () => void }): ReactElement {
  return (
    <StateMessage
      icon={<FolderIcon size={24} />}
      title="No libraries yet"
      detail="Add a folder of assets to start browsing without leaving Photoshop."
      action={{ label: 'Add Folder', onClick: onAddFolder }}
    />
  );
}

export function NoResultsState({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}): ReactElement {
  return (
    <StateMessage
      icon={<SearchIcon size={24} />}
      title="No matching assets"
      detail={`Nothing matches "${query}" in this library.`}
      action={{ label: 'Clear Search', onClick: onClear }}
    />
  );
}

export function EmptyFolderState(): ReactElement {
  return (
    <StateMessage
      icon={<FolderIcon size={24} />}
      title="This folder is empty"
      detail="No supported assets were found here. Check whether subfolders are included."
    />
  );
}

export function OfflineFolderState({
  folderName,
  onReconnect,
}: {
  folderName: string;
  onReconnect: () => void;
}): ReactElement {
  return (
    <StateMessage
      icon={<OfflineIcon size={24} />}
      title={`${folderName} is unavailable`}
      detail="The folder has moved, or the drive holding it is not connected."
      action={{ label: 'Reconnect', onClick: onReconnect }}
    />
  );
}

export function BootErrorState({ message }: { message: string }): ReactElement {
  return (
    <StateMessage
      icon={<WarningIcon size={24} />}
      title="Asset Browser could not start"
      detail={message}
    />
  );
}
