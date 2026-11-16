/**
 * The label an entry shows after the DM names what it is (#1212). A DM who
 * picks "Cat" wants an entry that reads "Cat", but a label they already typed
 * ("A stray follows you home") is theirs and is never replaced.
 */
export function labelAfterRefPick(currentLabel: string, pickedName: string): string {
  return currentLabel.trim() === "" ? pickedName : currentLabel;
}
