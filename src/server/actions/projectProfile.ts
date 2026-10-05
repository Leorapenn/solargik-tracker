"use server";

import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { requireActionAuth } from "@/lib/auth";
import { run, UserError, type ActionResult } from "@/lib/errors";
import { MAX_CONTRACT_BYTES, extractContractFields, type ContractClient, type ContractFields } from "@/lib/contractExtraction";
import type { ProfileInput } from "@/lib/projectProfile";
import { saveProfile } from "@/server/services/projectProfile";

export async function saveProjectProfile(projectId: string, input: ProfileInput): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await saveProfile(projectId, input);
    revalidatePath(`/projects/${projectId}`);
    return {};
  });
}

// Reads an uploaded contract PDF with Claude and returns suggested values for the form. The file is sent
// to Anthropic for this one request and is NOT stored anywhere; nothing is saved until a person reviews
// the suggestions and presses Save.
export async function extractContract(formData: FormData): Promise<ActionResult<{ fields: ContractFields }>> {
  await requireActionAuth();
  return run(async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new UserError("Reading contracts isn't switched on yet: the ANTHROPIC_API_KEY setting is missing.");

    const file = formData.get("contract");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choose a contract PDF first.");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new UserError("The contract must be a PDF.");
    if (file.size > MAX_CONTRACT_BYTES) throw new UserError("That PDF is larger than 4 MB. Use a smaller or compressed copy.");

    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    try {
      const client = new Anthropic({ apiKey }) as unknown as ContractClient;
      return { fields: await extractContractFields(data, client) };
    } catch (error) {
      // Never include the contract or the key in logs; the status is enough to diagnose.
      const status = (error as { status?: number }).status;
      console.error("Contract extraction failed", status ?? (error as Error).name);
      throw new UserError(
        status === 401
          ? "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY."
          : "Claude couldn't read that contract right now. Try again, or fill the fields in by hand.",
      );
    }
  });
}
