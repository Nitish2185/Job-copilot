// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileDrop } from "@/components/ui/FileDrop";

afterEach(cleanup);

function setup() {
  const onFile = vi.fn();
  render(
    <FileDrop
      id="resume-file"
      label="Your resume (PDF or DOCX, up to 5 MB)"
      title="Drag and drop your resume here"
      hint="PDF or Word (.docx), up to 5 MB"
      accept=".pdf,.docx"
      extensions={[".pdf", ".docx"]}
      maxBytes={5 * 1_048_576}
      onFile={onFile}
    />,
  );
  return onFile;
}

const pdf = (name = "resume.pdf", size = 10) =>
  new File([new Uint8Array(size)], name, { type: "application/pdf" });

describe("FileDrop", () => {
  it("asks for a file clearly and takes one from the picker", async () => {
    const user = userEvent.setup();
    const onFile = setup();
    expect(screen.getByText("Drag and drop your resume here")).toBeTruthy();
    expect(screen.getByText("Choose a file")).toBeTruthy();
    await user.upload(screen.getByLabelText(/Your resume/), pdf());
    expect(onFile).toHaveBeenCalledWith(expect.objectContaining({ name: "resume.pdf" }));
  });

  it("takes a dropped file and highlights while dragging", () => {
    const onFile = setup();
    const zone = screen.getByTestId("file-drop");
    fireEvent.dragOver(zone);
    expect(screen.getByText("Drop it here")).toBeTruthy();
    fireEvent.drop(zone, { dataTransfer: { files: [pdf("cv.docx")] } });
    expect(onFile).toHaveBeenCalledOnce();
  });

  it("refuses other file types and files that are too big", () => {
    const onFile = setup();
    const zone = screen.getByTestId("file-drop");
    fireEvent.drop(zone, { dataTransfer: { files: [pdf("photo.png")] } });
    expect(screen.getByRole("alert").textContent).toContain("is not a .pdf or .docx file");
    fireEvent.drop(zone, { dataTransfer: { files: [pdf("big.pdf", 6 * 1_048_576)] } });
    expect(screen.getByRole("alert").textContent).toContain("The limit is 5 MB");
    expect(onFile).not.toHaveBeenCalled();
  });
});
